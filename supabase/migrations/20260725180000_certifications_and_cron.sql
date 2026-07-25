-- 2026-07-25 — Chantier 3B : habilitations salariés + infra cron/email.
--
-- 1) Table `certifications` : liste prédéfinie de types + "Autre" en texte libre,
--    scopée entreprise (RLS identique au reste : is_admin() + get_my_company_id()).
--    Deux colonnes de suivi (alert_30_sent_at / alert_7_sent_at) pour ne jamais
--    ré-alerter en boucle une fois un palier notifié.
-- 2) pg_cron + pg_net : nécessaires pour déclencher les fonctions edge
--    weekly-digest / cert-expiry-alerts à heure fixe. `cron.timezone` ne peut
--    être changé qu'au redémarrage du serveur (hors de portée ici) : les jobs
--    sont donc planifiés en UTC fixe, calé sur l'heure d'été (CEST, UTC+2).
--    Ça glissera d'1h l'hiver (CET, UTC+1) — cosmétique (heure d'envoi d'un
--    email interne), à ajuster à la main si besoin via cron.schedule (upsert
--    par nom de job).
-- 3) Secret partagé (Vault) + fonction verify_cron_secret() : pg_cron appelle les
--    fonctions edge avec un header x-cron-secret vérifié côté Postgres (via RPC),
--    plutôt que verify_jwt du service_role — évite de faire transiter la clé
--    service_role, et le secret lui-même n'est jamais lu ni écrit en clair ici
--    (généré par Postgres, stocké chiffré dans Vault).

CREATE TABLE IF NOT EXISTS public.certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('caces', 'carte_btp', 'habilitation_electrique', 'visite_medicale', 'travail_hauteur', 'autre')),
  label text,
  expiry_date date NOT NULL,
  alert_30_sent_at timestamptz,
  alert_7_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS certifications_company_idx ON public.certifications(company_id);
CREATE INDEX IF NOT EXISTS certifications_user_idx ON public.certifications(user_id);
CREATE INDEX IF NOT EXISTS certifications_expiry_idx ON public.certifications(expiry_date);

ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certifications_admin_all ON public.certifications;
CREATE POLICY certifications_admin_all ON public.certifications FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());

-- ── pg_cron / pg_net ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── secret partagé pg_cron ↔ fonctions edge (généré par Postgres, jamais en clair ici) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_shared_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'cron_shared_secret',
      'Secret partagé pg_cron -> fonctions edge (weekly-digest, cert-expiry-alerts)'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'cron_shared_secret' AND decrypted_secret = candidate
  );
$$;
REVOKE EXECUTE ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

-- ── jobs planifiés (cron.schedule remplace le job existant si le nom matche) ──
-- UTC fixe calé CEST (été) : 16:00 UTC = 18h Paris été / 19h Paris hiver.
SELECT cron.schedule(
  'weekly-digest-friday',
  '0 16 * * 5',
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

-- UTC fixe calé CEST (été) : 05:00 UTC = 7h Paris été / 8h Paris hiver.
SELECT cron.schedule(
  'cert-expiry-alerts-daily',
  '0 5 * * *',
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
