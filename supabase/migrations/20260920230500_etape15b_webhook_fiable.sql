-- 2026-09-20 — Étape 15 bis : deux trous dans ma propre mécanique de webhook.
--
-- TROU 1 — « DÉJÀ VU » NE VEUT PAS DIRE « DÉJÀ FAIT ».
--   La version précédente posait une marque avant de travailler et l'effaçait
--   si le travail échouait. Ça ne couvre que les erreurs ATTRAPÉES. Si la
--   fonction plante, dépasse son temps, ou meurt avant d'effacer, la marque
--   reste. Stripe rejoue, voit la marque, reçoit 200 — et l'abonnement n'est
--   JAMAIS appliqué. Le client a payé et reste bloqué, définitivement cette
--   fois, parce que Stripe a cessé d'insister.
--   Même chose si un rejeu arrive pendant que le premier essai tourne encore :
--   le rejeu est écarté comme doublon, puis le premier échoue.
--
--   Une marque doit donc distinguer « en cours » de « terminé », et « en cours
--   depuis trop longtemps » doit pouvoir être repris.
--
-- TROU 2 — RELIRE CHEZ STRIPE NE SUFFIT PAS CONTRE LA CONCURRENCE.
--   Relire l'abonnement règle le désordre des messages en retard, mais pas deux
--   traitements simultanés : celui qui a lu « actif » peut écrire APRÈS celui
--   qui a lu « résilié ». Un compte résilié redevient actif.
--
--   La date de lecture chez Stripe devient donc une valeur qui ne recule pas :
--   une écriture n'est appliquée que si elle est fondée sur une lecture PLUS
--   RÉCENTE que la dernière appliquée. Le verrou sérialise, la comparaison
--   trie.
--
-- À exécuter AVANT de fusionner la PR.

-- ── 1) Une marque qui dit où en est le travail ────────────────────────────
ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_events_status_check') THEN
    ALTER TABLE public.stripe_events
      ADD CONSTRAINT stripe_events_status_check CHECK (status IN ('processing', 'done'));
  END IF;
END $$;

-- Les lignes déjà présentes viennent d'un traitement qui s'est bien terminé
-- (l'ancienne version ne les gardait qu'en cas de succès).
UPDATE public.stripe_events
   SET status = 'done', completed_at = COALESCE(completed_at, processed_at)
 WHERE status = 'processing' AND processed_at < now() - interval '1 minute';

-- ── 2) La date de la dernière lecture chez Stripe, par entreprise ─────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_read_at timestamptz;

COMMENT ON COLUMN public.companies.subscription_read_at IS
  'Date de la lecture chez Stripe sur laquelle repose l''état d''abonnement actuel. Une écriture fondée sur une lecture plus ancienne est ignorée.';

-- ── 3) Appliquer un état d'abonnement, sans se faire doubler ──────────────
CREATE OR REPLACE FUNCTION public.apply_subscription_state(
  p_company uuid,
  p_customer text,
  p_subscription text,
  p_status text,
  p_read_at timestamptz
)
 RETURNS TABLE (applied boolean, company_id uuid, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid;
  v_last timestamptz;
BEGIN
  SELECT c.id INTO v_company FROM public.companies c
   WHERE (p_company IS NOT NULL AND c.id = p_company)
      OR (p_company IS NULL AND p_customer IS NOT NULL AND c.stripe_customer_id = p_customer)
   LIMIT 1;

  IF v_company IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'entreprise introuvable';
    RETURN;
  END IF;

  -- Un seul traitement d'abonnement à la fois pour cette entreprise.
  PERFORM pg_advisory_xact_lock(4315, hashtext(v_company::text));

  SELECT c.subscription_read_at INTO v_last FROM public.companies c WHERE c.id = v_company;
  IF v_last IS NOT NULL AND p_read_at <= v_last THEN
    -- Une lecture plus fraîche a déjà été appliquée : ne pas revenir en arrière.
    RETURN QUERY SELECT false, v_company, 'lecture plus ancienne que la dernière appliquée';
    RETURN;
  END IF;

  UPDATE public.companies SET
    subscription_status  = CASE WHEN p_status IN ('active', 'trialing') THEN 'active' ELSE p_status END,
    stripe_subscription_id = CASE WHEN p_status = 'canceled' THEN NULL ELSE p_subscription END,
    stripe_customer_id   = COALESCE(p_customer, stripe_customer_id),
    subscription_read_at = p_read_at
  WHERE id = v_company;

  RETURN QUERY SELECT true, v_company, NULL::text;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.apply_subscription_state(uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_state(uuid, text, text, text, timestamptz)
  TO service_role;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='stripe_events' AND column_name IN ('status','started_at','completed_at')) AS colonnes_marque,
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='companies' AND column_name='subscription_read_at') AS colonne_lecture,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='apply_subscription_state') AS rpc;
