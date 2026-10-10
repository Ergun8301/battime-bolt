-- ════════════════════════════════════════════════════════════════════════════
-- Lot 3 bis — « Utiliser le panier repas » (réglage de l'entreprise).
--
-- 100 % ADDITIF : une colonne neuve AVEC valeur par défaut (true : rien ne
-- change pour personne) et une fonction neuve. Aucune policy, aucun trigger,
-- aucune fonction existante modifiés. Les paniers déjà notés
-- (time_entries.meal_allowance) ne sont JAMAIS touchés : décocher le réglage
-- masque la case, rien d'autre.
--
-- Écriture par fonction dédiée, comme set_colleagues_planning : companies n'a
-- aucune policy UPDATE, et élargir update_company_info casserait « Enregistrer »
-- tant que la base n'a pas suivi. Lecture : la policy SELECT existante
-- (companies_select_own_company) couvre la colonne neuve — le salarié la lit,
-- c'est voulu (sa journée en dépend). L'application la lit TOUJOURS seule
-- (select('meal_enabled')) : avant cette migration, seule cette lecture échoue
-- (42703) et l'application fait exactement comme avant.
--
-- Les gardes companies_feature_flags_guard et companies_support_flag_guard ne
-- comparent que kiosk_enabled, ai_enabled et support_enabled, et laissent passer
-- le propriétaire (postgres) — celui de cette fonction : elle n'est pas bloquée,
-- et les trois interrupteurs restent verrouillés.
--
-- Rejouable sans risque (IF NOT EXISTS, CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS meal_enabled boolean NOT NULL DEFAULT true;

-- Le bureau seulement (admin actif de SON entreprise). null → oui.
CREATE OR REPLACE FUNCTION public.set_meal_enabled(p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid := public.get_my_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.companies SET meal_enabled = coalesce(p_enabled, true) WHERE id = v_company;
  RETURN coalesce(p_enabled, true);
END;
$fn$;
-- Une fonction neuve est exécutable par anon par défaut (droits par défaut de
-- Supabase) : on le retire explicitement.
REVOKE EXECUTE ON FUNCTION public.set_meal_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meal_enabled(boolean) TO authenticated;

-- Contrôle :
-- SELECT data_type, column_default, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'meal_enabled';  -- boolean | true | NO
-- SELECT count(*) FROM public.companies WHERE meal_enabled IS DISTINCT FROM true;                -- 0 (juste après)
-- SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'set_meal_enabled';                    -- true | {search_path=""}
-- SELECT has_function_privilege('anon', 'public.set_meal_enabled(boolean)', 'execute');          -- false
--
-- RETOUR ARRIÈRE (ne touche à aucun panier noté ; l'application retombe sur « oui ») :
-- DROP FUNCTION IF EXISTS public.set_meal_enabled(boolean);
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS meal_enabled;
