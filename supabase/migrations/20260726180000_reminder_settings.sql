-- 2026-07-26 — Réglage de la relance automatique (activation + heure d'envoi).
--
-- Changement de stratégie du cron : pg_cron ne sait déclencher qu'à une heure
-- unique pour toute la base. Pour offrir une heure PAR ENTREPRISE, on passe le
-- job en HORAIRE et c'est la fonction qui décide, à chaque passage, quelles
-- entreprises sont concernées (celles dont reminder_hour = heure courante à Paris).
--
-- Effet de bord bienvenu : le filtre se faisant sur l'heure réelle à Paris
-- (Intl/timeZone), cette relance est INSENSIBLE au changement d'heure — contrairement
-- au récap hebdo et aux alertes habilitations, qui restent calés en UTC fixe et
-- décalent d'1 h l'hiver. Même remarque pour les jours : le lundi-vendredi est
-- évalué en heure de Paris, pas en UTC.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reminder_hour smallint NOT NULL DEFAULT 17;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_reminder_hour_range;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_reminder_hour_range CHECK (reminder_hour BETWEEN 0 AND 23);

COMMENT ON COLUMN public.companies.reminder_hour IS
  'Heure locale (Europe/Paris) d''envoi de la relance des pointages manquants. Défaut 17h.';

-- La signature d'une fonction fait partie de son identité : on remplace la version
-- à 9 paramètres plutôt que d'en créer une seconde (sinon appel ambigu côté PostgREST).
-- Les 2 nouveaux paramètres ont une valeur par défaut NULL = « ne pas toucher »,
-- donc le frontend actuellement EN PRODUCTION (qui n'envoie que les 9 premiers,
-- nommés) continue de fonctionner sans modification.
DROP FUNCTION IF EXISTS public.update_company_info(text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_company_info(
  p_name text, p_siret text, p_tva_intra text, p_address text, p_postal_code text,
  p_city text, p_phone text, p_email text, p_logo_url text,
  p_auto_reminder_enabled boolean DEFAULT NULL,
  p_reminder_hour smallint DEFAULT NULL
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
    reminder_hour         = COALESCE(p_reminder_hour, reminder_hour)
  WHERE id = v_company;
END;
$function$;

-- Cron horaire : la fonction filtre elle-même sur l'heure et le jour (Europe/Paris).
SELECT cron.unschedule('missing-days-reminders-weekdays');
SELECT cron.schedule(
  'missing-days-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sdperbcquvneohotjono.supabase.co/functions/v1/missing-days-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
