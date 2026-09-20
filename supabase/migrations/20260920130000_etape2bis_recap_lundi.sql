-- 2026-09-20 — Étape 2bis : le récap hebdomadaire part le lundi matin.
--
-- Il partait le vendredi 18 h et ne pouvait donc jamais contenir les heures du
-- samedi ni du dimanche. Envoyé le lundi 7 h sur la semaine écoulée, le compte
-- est complet. La fonction edge est changée en même temps : tant que les deux
-- ne concordent pas, aucun récap ne part (aucun doublon, aucune perte).

SELECT cron.unschedule('weekly-digest-friday');

SELECT cron.schedule(
  'weekly-digest-monday',
  '0 5,6 * * 1',
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

-- Contrôle : une seule tâche de récap, le lundi.
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'weekly-digest%';
