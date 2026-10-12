-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 6 (oct. 2026) — COUCHE IA V2 : PLUS DE CLÉ DE SERVICE, COMPTEUR GLOBAL
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin). D'ABORD remettre les fonctions
-- Edge d'avant le lot 6 (assistant, worker-assistant, payslip-read), qui
-- appellent assistant_consume / worker_assistant_consume avec la clé de
-- service : ces deux fonctions n'ont jamais été modifiées. Puis :
--   DROP FUNCTION IF EXISTS public.assistant_context(text, integer, text, integer);
-- Les deux tables de compteurs RESTENT (fermées, que des nombres par jour, aucune
-- donnée personnelle) : rien n'est effacé, et recharger ce fichier les retrouve.
--
-- VÉRIFICATION APRÈS APPLICATION (doit renvoyer 8 × true, aussi plus tard) :
--   SELECT
--     ((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_project_usage'
--        AND is_nullable = 'NO' AND ((column_name = 'day' AND data_type = 'date') OR (column_name = 'tier' AND data_type = 'text')
--          OR (column_name = 'requests' AND data_type = 'integer'))) = 3
--      AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_project_usage') = 3) AS compteur_global,
--     ((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_bulletin_usage'
--        AND is_nullable = 'NO' AND ((column_name = 'company_id' AND data_type = 'uuid') OR (column_name = 'day' AND data_type = 'date')
--          OR (column_name = 'reads' AND data_type = 'integer'))) = 3
--      AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_bulletin_usage') = 3) AS compteur_bulletins,
--     EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_project_usage'::regclass AND contype = 'c'
--             AND pg_get_constraintdef(oid) LIKE '%rapide%documents%')                                  AS niveaux,
--     ((SELECT count(*) FROM pg_class WHERE oid IN ('public.ai_project_usage'::regclass, 'public.ai_bulletin_usage'::regclass) AND relrowsecurity) = 2
--      AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('ai_project_usage', 'ai_bulletin_usage'))) AS tables_fermees,
--     (NOT has_table_privilege('anon', 'public.ai_project_usage', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
--      AND NOT has_table_privilege('authenticated', 'public.ai_project_usage', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
--      AND NOT has_table_privilege('service_role', 'public.ai_project_usage', 'DELETE, TRUNCATE')
--      AND NOT has_table_privilege('anon', 'public.ai_bulletin_usage', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
--      AND NOT has_table_privilege('authenticated', 'public.ai_bulletin_usage', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
--      AND NOT has_table_privilege('service_role', 'public.ai_bulletin_usage', 'DELETE, TRUNCATE')) AS droits_tables,
--     EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.assistant_context(text, integer, text, integer)'::regprocedure
--             AND prosecdef AND proconfig @> ARRAY['search_path=""'])                                    AS fonction_sure,
--     (has_function_privilege('authenticated', 'public.assistant_context(text, integer, text, integer)', 'EXECUTE')
--      AND NOT has_function_privilege('anon', 'public.assistant_context(text, integer, text, integer)', 'EXECUTE')
--      AND NOT has_function_privilege('service_role', 'public.assistant_context(text, integer, text, integer)', 'EXECUTE')
--      AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--                      WHERE p.oid = 'public.assistant_context(text, integer, text, integer)'::regprocedure AND a.grantee = 0)) AS droits_fonction,
--     (NOT has_function_privilege('authenticated', 'public.assistant_consume(uuid, integer)', 'EXECUTE')
--      AND NOT has_function_privilege('authenticated', 'public.worker_assistant_consume(uuid, integer)', 'EXECUTE')
--      AND NOT has_table_privilege('authenticated', 'public.assistant_usage', 'SELECT')
--      AND NOT has_table_privilege('authenticated', 'public.worker_assistant_usage', 'SELECT'))         AS anciens_intacts;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261012090000', 'lot6_couche_ia_v2') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : les fonctions assistant, worker-assistant et payslip-read gardent
-- la clé de service pour trois choses seulement : savoir QUI appelle (rôle,
-- entreprise, compte actif), lire companies.ai_enabled, et consommer le quota
-- (assistant_consume / worker_assistant_consume, réservées à la clé de service).
-- Règle d'Ergun : l'assistant agit avec les droits de la personne connectée,
-- JAMAIS avec une clé de service.
--
-- CE QUI CHANGE :
--   · une fonction NEUVE public.assistant_context(côté, limite, niveau, plafond),
--     appelée avec le JETON DE LA PERSONNE. En UN aller-retour : qui je suis,
--     mon entreprise, ai_enabled, et le quota consommé de façon ATOMIQUE (même
--     ligne, même table et même règle que les lots 3 et 4 : un refus ne compte
--     pas) ;
--   · le côté « bulletin » (payslip-read), qui n'avait AUCUN quota, en reçoit un
--     par entreprise et par jour (table neuve ai_bulletin_usage) : sans lui, un
--     appel direct à la fonction pourrait user le compteur global à volonté ;
--   · une table NEUVE public.ai_project_usage (jour, niveau, nombre) : le
--     COMPTEUR GLOBAL. Le gratuit de Gemini est compté par PROJET : au-delà du
--     plafond du jour (réglé dans AI_CONFIG, côté fonctions Edge), « L'assistant
--     est en pause jusqu'à demain ». Le jour est celui de Google (heure du
--     Pacifique, remise à zéro vers 9 h à Paris). Aucune question, aucune
--     réponse, aucun nom n'y est stocké. Une demande refusée par le quota de la
--     personne / de l'entreprise n'y compte JAMAIS.
--
-- SÉCURITÉ :
--   · la personne ne choisit ni son entreprise ni son rôle : tout est lu d'après
--     auth.uid() ; une autre entreprise ne touche jamais nos lignes ;
--   · les limites passées par l'appelant sont BORNÉES en base (quota : 500 par
--     jour ; plafond global : 100 000) : appeler la fonction en direct avec une
--     limite énorme ne fait que consommer SON propre quota, rien de plus ;
--   · anon : aucun droit ; les deux compteurs sont fermés à tous (RLS sans
--     policy, droits retirés) ; seule la fonction les écrit ; la clé de service
--     peut les lire et les écrire, jamais les vider ;
--   · assistant_consume, worker_assistant_consume, assistant_usage et
--     worker_assistant_usage ne sont NI modifiées NI rouvertes (la fonction
--     neuve y ajoute seulement 1 à une ligne, comme elles le font).
--
-- 100 % ADDITIVE : deux tables neuves, une fonction neuve, des droits sur ces
-- trois objets seulement. Aucune table, colonne, policy, fonction ou trigger
-- existant n'est modifié. Rejouable (IF NOT EXISTS, CREATE OR REPLACE). Aucune
-- clé étrangère (une suppression d'entreprise ne doit jamais être bloquée par
-- un compteur). Rien n'est effacé ni vidé par ce fichier ; la seule instruction
-- de retrait est celle du RETOUR ARRIÈRE ci-dessus, à coller à la main.
--
-- AVANT APPLICATION : l'application fonctionne exactement comme aujourd'hui
-- (les fonctions Edge déployées n'appellent pas assistant_context). ORDRE DE
-- MISE EN LIGNE : cette migration D'ABORD, puis redéployer les 4 fonctions.
--
-- Testée sur un Postgres jetable : npm run test:couche-ia
-- (supabase/tests/lot6_couche_ia_v2.mjs).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Le compteur global (tout le projet, par jour de Google et par niveau) ────
CREATE TABLE IF NOT EXISTS public.ai_project_usage (
  day      date    NOT NULL,
  tier     text    NOT NULL CHECK (tier IN ('rapide', 'documents')),
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  PRIMARY KEY (day, tier)
);
COMMENT ON TABLE public.ai_project_usage IS
  'Lot 6 : demandes d''IA du jour pour TOUT le projet (gratuit Gemini compté par projet). Jour = heure du Pacifique. Que des nombres.';

-- ── Le quota des lectures de bulletin (par entreprise et par jour de Paris) ──
CREATE TABLE IF NOT EXISTS public.ai_bulletin_usage (
  company_id uuid    NOT NULL,
  day        date    NOT NULL,
  reads      integer NOT NULL DEFAULT 0 CHECK (reads >= 0),
  PRIMARY KEY (company_id, day)
);
COMMENT ON TABLE public.ai_bulletin_usage IS
  'Lot 6 : lectures de bulletin par entreprise et par jour (quota de payslip-read). Que des nombres.';

-- Fermées à tous côté client (RLS sans policy) ; droits par défaut retirés.
ALTER TABLE public.ai_project_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_bulletin_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_project_usage FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.ai_bulletin_usage FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.ai_project_usage TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ai_bulletin_usage TO service_role;

-- ── Qui je suis + quota + plafond global, en un aller-retour, avec le jeton de la personne ──
-- p_side         'bureau' (admin) | 'salarie' (worker, lead) | 'bulletin' (admin, payslip-read)
-- p_limit        quota du jour (secret de la fonction Edge), borné à 500 ici
-- p_tier         'rapide' | 'documents' : le modèle qui va servir
-- p_global_limit plafond du jour pour tout le projet, borné à 100 000 ici ; NULL = pas de plafond
-- Rend { ok: true, user_id, company_id, role, ai_enabled, used, remaining, projet_used }
-- ou { ok: false, raison: non_connecte | cote_inconnu | non_autorise | ia_coupee
--      | niveau_inconnu | pause | quota } : dans ces cas RIEN n'est compté.
CREATE OR REPLACE FUNCTION public.assistant_context(
  p_side text, p_limit integer, p_tier text DEFAULT NULL, p_global_limit integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_co    uuid;
  v_role  text;
  v_on    boolean;
  v_ai    boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 0), 0), 500);
  v_glim  integer := CASE WHEN p_global_limit IS NULL THEN NULL ELSE least(greatest(p_global_limit, 0), 100000) END;
  v_used  integer := NULL;
  v_g     integer := NULL;
  v_day   date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_gday  date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;
  IF p_side IS NULL OR p_side NOT IN ('bureau', 'salarie', 'bulletin') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'cote_inconnu');
  END IF;

  SELECT u.company_id, u.role, u.is_active IS DISTINCT FROM false
    INTO v_co, v_role, v_on
    FROM public.users u WHERE u.id = v_uid;
  IF v_co IS NULL OR v_on IS NOT TRUE
     OR (p_side IN ('bureau', 'bulletin') AND v_role IS DISTINCT FROM 'admin')
     OR (p_side = 'salarie' AND coalesce(v_role, '') NOT IN ('worker', 'lead')) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_autorise');
  END IF;

  SELECT c.ai_enabled INTO v_ai FROM public.companies c WHERE c.id = v_co;
  IF v_ai IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'ia_coupee', 'ai_enabled', false);
  END IF;

  -- Plafond global : la ligne du jour est VERROUILLÉE jusqu'à la fin de l'appel
  -- (deux demandes en même temps ne dépassent pas le plafond).
  IF v_glim IS NOT NULL THEN
    IF p_tier IS NULL OR p_tier NOT IN ('rapide', 'documents') THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'niveau_inconnu');
    END IF;
    INSERT INTO public.ai_project_usage (day, tier, requests) VALUES (v_gday, p_tier, 0)
      ON CONFLICT (day, tier) DO NOTHING;
    SELECT g.requests INTO v_g FROM public.ai_project_usage g
     WHERE g.day = v_gday AND g.tier = p_tier FOR UPDATE;
    IF v_g >= v_glim THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'pause', 'projet_used', v_g);
    END IF;
  END IF;

  -- Quota de la personne / de l'entreprise : mêmes tables et même règle que
  -- assistant_consume et worker_assistant_consume (un refus ne compte pas).
  IF p_side = 'bureau' THEN
    INSERT INTO public.assistant_usage AS u (company_id, day, questions)
    SELECT v_co, v_day, 1 WHERE v_limit > 0
    ON CONFLICT (company_id, day) DO UPDATE SET questions = u.questions + 1
      WHERE u.questions < v_limit
    RETURNING u.questions INTO v_used;
  ELSIF p_side = 'salarie' THEN
    INSERT INTO public.worker_assistant_usage AS u (user_id, day, requests)
    SELECT v_uid, v_day, 1 WHERE v_limit > 0
    ON CONFLICT (user_id, day) DO UPDATE SET requests = u.requests + 1
      WHERE u.requests < v_limit
    RETURNING u.requests INTO v_used;
  ELSE
    INSERT INTO public.ai_bulletin_usage AS u (company_id, day, reads)
    SELECT v_co, v_day, 1 WHERE v_limit > 0
    ON CONFLICT (company_id, day) DO UPDATE SET reads = u.reads + 1
      WHERE u.reads < v_limit
    RETURNING u.reads INTO v_used;
  END IF;
  IF v_used IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'quota', 'limite', v_limit);
  END IF;

  -- Le compteur global n'avance QUE si le quota ci-dessus a laissé passer.
  IF v_glim IS NOT NULL THEN
    UPDATE public.ai_project_usage g SET requests = g.requests + 1
     WHERE g.day = v_gday AND g.tier = p_tier
    RETURNING g.requests INTO v_g;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'user_id', v_uid, 'company_id', v_co, 'role', v_role, 'ai_enabled', true,
    'used', v_used, 'remaining', greatest(0, v_limit - v_used), 'projet_used', v_g);
END;
$fn$;
COMMENT ON FUNCTION public.assistant_context(text, integer, text, integer) IS
  'Lot 6 : qui je suis, mon entreprise, ai_enabled, quota consommé (atomique) et compteur global, avec le jeton de la personne. Plus de clé de service dans les assistants.';
REVOKE ALL ON FUNCTION public.assistant_context(text, integer, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.assistant_context(text, integer, text, integer) TO authenticated;
