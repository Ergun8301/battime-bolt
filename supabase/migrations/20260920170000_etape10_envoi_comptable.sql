-- 2026-09-20 — Étape 10 : envoyer l'export au comptable.
--
-- L'entreprise enregistre l'adresse de son comptable une fois pour toutes ;
-- elle reste modifiable dans les réglages. Le fichier part en pièce jointe,
-- pas en lien : le comptable reçoit un tableur, pas quelque chose à cliquer.
--
-- À exécuter AVANT de fusionner la PR.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS accountant_email text;

COMMENT ON COLUMN public.companies.accountant_email IS
  'Adresse du comptable, destinataire de l''export de paie. Décision de l''entreprise : rien ne part sans une action explicite du bureau.';

-- Le réglage rejoint les autres champs humains. Comme aux étapes 7 et 8, le
-- remplacement reste compatible avec l'application déjà en ligne : un appel qui
-- n'envoie pas le nouveau paramètre ne touche pas au réglage.
DROP FUNCTION IF EXISTS public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean, numeric);

CREATE OR REPLACE FUNCTION public.update_company_info(
  p_name text, p_siret text, p_tva_intra text, p_address text, p_postal_code text,
  p_city text, p_phone text, p_email text, p_logo_url text,
  p_auto_reminder_enabled boolean DEFAULT NULL,
  p_reminder_hour smallint DEFAULT NULL,
  p_budget_alerts_enabled boolean DEFAULT NULL,
  p_travel_paid boolean DEFAULT NULL,
  p_weekly_hours numeric DEFAULT NULL,
  p_accountant_email text DEFAULT NULL
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
  -- Une adresse mal formée enverrait la paie dans le vide sans le dire.
  IF nullif(btrim(p_accountant_email), '') IS NOT NULL
     AND btrim(p_accountant_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Adresse du comptable invalide';
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
    weekly_hours          = COALESCE(p_weekly_hours, weekly_hours),
    -- Chaîne vide = le bureau efface l'adresse ; NULL = il n'y touche pas.
    accountant_email      = CASE
                              WHEN p_accountant_email IS NULL THEN accountant_email
                              ELSE nullif(btrim(p_accountant_email), '')
                            END
  WHERE id = v_company;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean, numeric, text) FROM PUBLIC, anon;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='companies' AND column_name='accountant_email') AS colonne,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='update_company_info') AS nb_versions_rpc;
