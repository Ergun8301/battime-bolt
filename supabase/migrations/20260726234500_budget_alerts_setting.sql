-- 2026-07-26 — Interrupteur des alertes de budget dans l'écran Réglages.
--
-- Ajoute p_budget_alerts_enabled à update_company_info. Comme précédemment, la
-- signature fait partie de l'identité de la fonction : on REMPLACE l'unique
-- version existante plutôt que d'en créer une seconde (deux surcharges rendraient
-- l'appel ambigu côté PostgREST).
--
-- Les trois derniers paramètres valent NULL par défaut = « ne pas toucher », donc
-- les appels plus courts continuent de fonctionner :
--   - 9 paramètres  : le frontend actuellement EN PRODUCTION ;
--   - 11 paramètres : le frontend de la branche d'intégration avant ce commit ;
--   - 12 paramètres : le frontend après ce commit.

DROP FUNCTION IF EXISTS public.update_company_info(
  text, text, text, text, text, text, text, text, text, boolean, smallint
);

CREATE OR REPLACE FUNCTION public.update_company_info(
  p_name text, p_siret text, p_tva_intra text, p_address text, p_postal_code text,
  p_city text, p_phone text, p_email text, p_logo_url text,
  p_auto_reminder_enabled boolean DEFAULT NULL,
  p_reminder_hour smallint DEFAULT NULL,
  p_budget_alerts_enabled boolean DEFAULT NULL
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
    budget_alerts_enabled = COALESCE(p_budget_alerts_enabled, budget_alerts_enabled)
  WHERE id = v_company;
END;
$function$;
