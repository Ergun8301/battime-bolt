-- 2026-09-20 — Étape 8 : les heures supplémentaires ont enfin une base de calcul.
--
-- Jusqu'ici BEMEXO ne savait pas ce qu'était une heure supplémentaire : aucun
-- horaire de référence nulle part. Le site public l'a longtemps promis, et
-- l'étape 14 a dû retirer la promesse faute de fonction derrière.
--
-- Décision métier : horaire hebdomadaire de base par entreprise, exception
-- possible salarié par salarié, calcul à la semaine (lundi → dimanche, comme
-- partout ailleurs dans l'application).
--
-- À exécuter AVANT de fusionner la PR, et APRÈS les blocs des étapes 6 et 7 :
-- ce fichier remplace update_company_info, qui a gagné un paramètre à l'étape 7.

-- ── 1) L'horaire de base de l'entreprise ──────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS weekly_hours numeric NOT NULL DEFAULT 35
  CONSTRAINT companies_weekly_hours_check CHECK (weekly_hours >= 0 AND weekly_hours <= 80);

COMMENT ON COLUMN public.companies.weekly_hours IS
  'Horaire hebdomadaire de base de l''entreprise. Au-delà, les heures sont supplémentaires. 35 par défaut.';

-- ── 2) L'exception, salarié par salarié ───────────────────────────────────
-- Elle vit dans user_payroll : c'est une donnée de paie, donc réservée au
-- bureau, comme le taux horaire et le contrat.
ALTER TABLE public.user_payroll
  ADD COLUMN IF NOT EXISTS weekly_hours numeric
  CONSTRAINT user_payroll_weekly_hours_check CHECK (weekly_hours >= 0 AND weekly_hours <= 80);

COMMENT ON COLUMN public.user_payroll.weekly_hours IS
  'Horaire hebdomadaire propre à ce salarié. NULL = celui de l''entreprise s''applique. 0 est une valeur volontaire, pas une absence de réglage.';

-- ── 3) Le réglage rejoint les autres champs humains ───────────────────────
-- Même principe qu'à l'étape 7 : un appel qui n'envoie pas le nouveau
-- paramètre continue de fonctionner, donc l'application en ligne n'est pas
-- cassée entre l'exécution de ce bloc et la fusion.
DROP FUNCTION IF EXISTS public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean);

CREATE OR REPLACE FUNCTION public.update_company_info(
  p_name text, p_siret text, p_tva_intra text, p_address text, p_postal_code text,
  p_city text, p_phone text, p_email text, p_logo_url text,
  p_auto_reminder_enabled boolean DEFAULT NULL,
  p_reminder_hour smallint DEFAULT NULL,
  p_budget_alerts_enabled boolean DEFAULT NULL,
  p_travel_paid boolean DEFAULT NULL,
  p_weekly_hours numeric DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_role public.battime_role;
BEGIN
  SELECT u.company_id, u.role INTO v_company, v_role
  FROM public.users u WHERE u.id = auth.uid();
  IF v_company IS NULL OR v_role::text <> 'admin' THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''entreprise';
  END IF;

  IF p_reminder_hour IS NOT NULL AND (p_reminder_hour < 0 OR p_reminder_hour > 23) THEN
    RAISE EXCEPTION 'Heure de relance invalide';
  END IF;
  IF p_weekly_hours IS NOT NULL AND (p_weekly_hours < 0 OR p_weekly_hours > 80) THEN
    RAISE EXCEPTION 'Horaire hebdomadaire invalide';
  END IF;

  UPDATE public.companies SET
    name        = COALESCE(nullif(btrim(p_name), ''), name),
    siret       = nullif(btrim(p_siret), ''),
    tva_intra   = nullif(btrim(p_tva_intra), ''),
    address     = nullif(btrim(p_address), ''),
    postal_code = nullif(btrim(p_postal_code), ''),
    city        = nullif(btrim(p_city), ''),
    phone       = nullif(btrim(p_phone), ''),
    email       = nullif(btrim(p_email), ''),
    logo_url    = nullif(btrim(p_logo_url), ''),
    auto_reminder_enabled = COALESCE(p_auto_reminder_enabled, auto_reminder_enabled),
    reminder_hour         = COALESCE(p_reminder_hour, reminder_hour),
    budget_alerts_enabled = COALESCE(p_budget_alerts_enabled, budget_alerts_enabled),
    travel_paid           = COALESCE(p_travel_paid, travel_paid),
    weekly_hours          = COALESCE(p_weekly_hours, weekly_hours)
  WHERE id = v_company;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean, numeric) FROM PUBLIC, anon;

-- ── 4) Contrôle ───────────────────────────────────────────────────────────
-- SELECT
--   (SELECT weekly_hours FROM public.companies LIMIT 1) AS horaire_entreprise,
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='user_payroll' AND column_name='weekly_hours') AS exception_salarie,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='update_company_info') AS rpc_reglages;
