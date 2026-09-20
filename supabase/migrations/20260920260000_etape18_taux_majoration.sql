-- 2026-09-20 — Étape 18 : les taux de majoration des heures supplémentaires.
--
-- CE QUI MANQUAIT. Le logiciel comptait les heures supplémentaires mais ne
-- disait nulle part ce qu'elles coûtent. Le comptable recevait « 6 h sup » sans
-- savoir à quel taux les payer, et le bureau refaisait le calcul à la main.
--
-- POURQUOI UN RÉGLAGE ET PAS UNE CONSTANTE. Le taux légal français est +25 %
-- puis +50 %, mais une convention collective ou un accord d'entreprise peut
-- dire autrement. Écrire 25 et 50 en dur aurait produit un bulletin faux pour
-- toute entreprise qui n'est pas au régime de base — et faux en silence.
-- L'entreprise saisit ses propres taux ; 25 et 50 ne sont que la valeur de
-- départ.
--
-- LE SEUIL ENTRE LES DEUX PALIERS. Palier 1 = les 8 PREMIÈRES heures
-- supplémentaires de la semaine, palier 2 = au-delà. C'est la règle française,
-- et elle reste juste quel que soit l'horaire de base : avec une base à 39 h,
-- le palier 1 couvre la 40e à la 47e heure. Ce seuil n'est pas réglable —
-- personne ne l'a demandé, et un réglage de plus qu'on ne saurait pas remplir
-- est un piège. Dis-le si ta convention diffère.
--
-- À exécuter AVANT de fusionner la PR.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS overtime_rate_1 numeric(5, 2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS overtime_rate_2 numeric(5, 2) NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.companies.overtime_rate_1 IS
  'Majoration en % des 8 premières heures supplémentaires de la semaine. Défaut 25 (taux légal français).';
COMMENT ON COLUMN public.companies.overtime_rate_2 IS
  'Majoration en % des heures supplémentaires au-delà de la 8e. Défaut 50 (taux légal français).';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_overtime_rates_check') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_overtime_rates_check
      CHECK (overtime_rate_1 >= 0 AND overtime_rate_1 <= 200
         AND overtime_rate_2 >= 0 AND overtime_rate_2 <= 200);
  END IF;
END $$;

-- Le réglage rejoint les autres champs humains. Comme aux étapes précédentes,
-- le remplacement reste compatible avec l'application déjà en ligne : un appel
-- qui n'envoie pas les nouveaux paramètres ne touche pas aux réglages.
DROP FUNCTION IF EXISTS public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean, numeric, text);

CREATE OR REPLACE FUNCTION public.update_company_info(
  p_name text, p_siret text, p_tva_intra text, p_address text, p_postal_code text,
  p_city text, p_phone text, p_email text, p_logo_url text,
  p_auto_reminder_enabled boolean DEFAULT NULL,
  p_reminder_hour smallint DEFAULT NULL,
  p_budget_alerts_enabled boolean DEFAULT NULL,
  p_travel_paid boolean DEFAULT NULL,
  p_weekly_hours numeric DEFAULT NULL,
  p_accountant_email text DEFAULT NULL,
  p_overtime_rate_1 numeric DEFAULT NULL,
  p_overtime_rate_2 numeric DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
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
  IF nullif(btrim(p_accountant_email), '') IS NOT NULL
     AND btrim(p_accountant_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Adresse du comptable invalide';
  END IF;
  -- Un taux négatif ou délirant produirait un coût faux sans rien casser :
  -- c'est exactement le genre d'erreur qu'il faut refuser à la saisie.
  IF (p_overtime_rate_1 IS NOT NULL AND (p_overtime_rate_1 < 0 OR p_overtime_rate_1 > 200))
  OR (p_overtime_rate_2 IS NOT NULL AND (p_overtime_rate_2 < 0 OR p_overtime_rate_2 > 200)) THEN
    -- `%%` : dans un message RAISE, un `%` seul est un emplacement de format.
    RAISE EXCEPTION 'Taux de majoration invalide (0 à 200 %%)';
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
    overtime_rate_1       = COALESCE(p_overtime_rate_1, overtime_rate_1),
    overtime_rate_2       = COALESCE(p_overtime_rate_2, overtime_rate_2),
    accountant_email      = CASE
                              WHEN p_accountant_email IS NULL THEN accountant_email
                              ELSE nullif(btrim(p_accountant_email), '')
                            END
  WHERE id = v_company;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean, numeric, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean, numeric, text, numeric, numeric) TO authenticated;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='companies' AND column_name LIKE 'overtime_rate%') AS colonnes,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='update_company_info') AS nb_versions_rpc;
