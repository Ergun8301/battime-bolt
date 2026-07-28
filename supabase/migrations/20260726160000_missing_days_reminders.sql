-- 2026-07-26 — Relance automatique des pointages manquants.
--
-- Problème réglé : aujourd'hui, récupérer les heures d'un salarié en retard est
-- 100 % manuel (ouvrir Salariés, repérer la pastille, cliquer la cloche, un par
-- un). Ce lot rend la relance automatique — le salarié est prévenu directement,
-- le bureau n'a plus à courir après.
--
-- Garde-fous anti-harcèlement (le vrai enjeu : si on sur-notifie, le salarié
-- coupe les notifications et la fonctionnalité se retourne contre elle-même) :
--   - une seule notification par salarié et par exécution, tous jours regroupés ;
--   - une relance tous les 2 jours maximum ;
--   - 3 relances maximum, ensuite on arrête (au-delà, ce n'est plus un oubli) ;
--   - fenêtre de 14 jours : un jour plus ancien sort du périmètre.
-- Le compteur est remis à zéro dès que le salarié n'a plus rien en retard.
--
-- La règle « jour manquant » est EXACTEMENT celle déjà en production
-- (lib/work-status.ts) : jour passé + affectation chantier + aucune saisie
-- non-brouillon. Une absence (congé/maladie/intempérie) n'est jamais manquante.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS auto_reminder_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.auto_reminder_enabled IS
  'false = pas de relance automatique des pointages manquants (comptes de démo/test). Défaut true.';

-- Journal de relance : un enregistrement par salarié, qui porte les garde-fous.
CREATE TABLE IF NOT EXISTS public.reminder_log (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  sent_count integer NOT NULL DEFAULT 1,
  channel text
);
CREATE INDEX IF NOT EXISTS reminder_log_company_idx ON public.reminder_log(company_id);

-- Aucune politique RLS : cette table n'est lue/écrite que par la fonction edge
-- (service_role, qui contourne la RLS). Aucun accès client, volontairement —
-- c'est un journal interne, pas une donnée métier consultable.
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

-- Cron : lundi → vendredi à 17 h (heure de Paris). Comme les autres jobs, planifié
-- en UTC fixe calé sur l'heure d'été (15:00 UTC = 17 h été / 18 h hiver), car
-- cron.timezone n'est modifiable qu'au redémarrage du serveur.
-- Pas le samedi ni le dimanche : beaucoup d'équipes BTP ne travaillent pas, et
-- une relance un jour non travaillé est une notification inutile. Un samedi
-- planifié non déclaré reste détecté — il sera signalé le lundi suivant.
SELECT cron.schedule(
  'missing-days-reminders-weekdays',
  '0 15 * * 1-5',
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
