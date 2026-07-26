-- 2026-07-26 — Récap hebdo et alertes habilitations insensibles au changement d'heure.
--
-- Avant : jobs calés en UTC fixe sur l'heure d'été → décalage d'1 h l'hiver
-- (récap à 19 h au lieu de 18 h, alertes à 8 h au lieu de 7 h).
--
-- Méthode : Paris n'a que DEUX décalages possibles (UTC+1 l'hiver, UTC+2 l'été),
-- donc deux heures candidates suffisent — inutile de passer en cron horaire
-- (24 déclenchements/jour) comme pour la relance, où l'heure est configurable
-- par entreprise. Le cron déclenche aux deux heures possibles, et la fonction
-- ne travaille que si l'heure RÉELLE à Paris est la bonne (Intl/timeZone).
--
--   Récap hebdo   : 18 h Paris = 16:00 UTC (été) ou 17:00 UTC (hiver)
--   Alertes habil. : 7 h Paris = 05:00 UTC (été) ou 06:00 UTC (hiver)

SELECT cron.unschedule('weekly-digest-friday');
SELECT cron.schedule(
  'weekly-digest-friday',
  '0 16,17 * * 5',
  $$
  SELECT net.http_post(
    url := 'https://sdperbcquvneohotjono.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('cert-expiry-alerts-daily');
SELECT cron.schedule(
  'cert-expiry-alerts-daily',
  '0 5,6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://sdperbcquvneohotjono.supabase.co/functions/v1/cert-expiry-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
