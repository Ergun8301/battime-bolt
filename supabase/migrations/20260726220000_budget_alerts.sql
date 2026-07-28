-- 2026-07-26 — Alerte de dépassement de budget chantier.
--
-- Deux budgets FACULTATIFS par chantier, l'un ou l'autre ou les deux :
--   budget_hours  : budget de main-d'œuvre en HEURES — toujours calculable,
--                   indépendant des taux horaires (souvent non renseignés), et
--                   c'est ainsi qu'un patron BTP devise (« 3 jours à 2 gars »).
--   budget_amount : budget de main-d'œuvre en EUROS — n'est fiable que si TOUS
--                   les salariés du chantier ont un taux horaire renseigné.
--
-- IMPORTANT : il s'agit d'un budget de MAIN-D'ŒUVRE, pas d'un budget de chantier
-- au sens large. BEMEXO ne connaît ni les matériaux, ni la sous-traitance, ni la
-- location de matériel — comparer un budget total à la seule main-d'œuvre ne
-- déclencherait jamais l'alerte. Le libellé de l'interface doit rester explicite.
--
-- Trois paliers : 70 % (on peut encore réorganiser), 80 % (dernière marge de
-- manœuvre), 100 % (dépassement constaté). Une seule alerte par palier et par
-- chantier — jamais de répétition. Modifier un budget remet les compteurs à zéro
-- (nouveau budget = nouvelle référence), via le déclencheur ci-dessous.

ALTER TABLE public.worksites
  ADD COLUMN IF NOT EXISTS budget_hours numeric,
  ADD COLUMN IF NOT EXISTS budget_amount numeric,
  ADD COLUMN IF NOT EXISTS alert_70_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_80_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_100_sent_at timestamptz;

ALTER TABLE public.worksites DROP CONSTRAINT IF EXISTS worksites_budget_positive;
ALTER TABLE public.worksites ADD CONSTRAINT worksites_budget_positive
  CHECK ((budget_hours IS NULL OR budget_hours >= 0) AND (budget_amount IS NULL OR budget_amount >= 0));

COMMENT ON COLUMN public.worksites.budget_hours IS
  'Budget de main-d''œuvre en heures (facultatif). Sert aux alertes de dépassement.';
COMMENT ON COLUMN public.worksites.budget_amount IS
  'Budget de main-d''œuvre en euros (facultatif). Fiable seulement si tous les taux horaires sont renseignés.';

-- Changer un budget = nouvelle référence : on réarme les trois paliers.
CREATE OR REPLACE FUNCTION public.reset_budget_alerts()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.budget_hours IS DISTINCT FROM OLD.budget_hours
     OR NEW.budget_amount IS DISTINCT FROM OLD.budget_amount THEN
    NEW.alert_70_sent_at := NULL;
    NEW.alert_80_sent_at := NULL;
    NEW.alert_100_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS worksites_reset_budget_alerts ON public.worksites;
CREATE TRIGGER worksites_reset_budget_alerts
  BEFORE UPDATE ON public.worksites
  FOR EACH ROW EXECUTE FUNCTION public.reset_budget_alerts();

-- Interrupteur par entreprise, comme le récap hebdo et la relance.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS budget_alerts_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.budget_alerts_enabled IS
  'false = pas d''alerte de dépassement de budget chantier. Défaut true.';

-- Cron quotidien à 7 h Paris. Comme les autres, deux heures UTC candidates
-- (05:00 été / 06:00 hiver) et c'est la fonction qui retient la bonne.
SELECT cron.schedule(
  'budget-alerts-daily',
  '0 5,6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://sdperbcquvneohotjono.supabase.co/functions/v1/budget-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
