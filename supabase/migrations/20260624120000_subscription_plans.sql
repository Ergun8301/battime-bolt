-- 2026-06-24 — Lot 5 : table des paliers d'abonnement Stripe.
-- Appliqué en prod (sdperbcquvneohotjono). Versionné pour le staging.
-- Les 3 prix sont des fiches Price Stripe indépendantes → ajouter/changer un
-- prix = créer la Price dans Stripe + mettre à jour une ligne ici (aucun code).

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  stripe_price_id text NOT NULL,
  amount_eur integer NOT NULL,
  min_workers integer,
  max_workers integer,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_plans_select ON public.subscription_plans;
CREATE POLICY subscription_plans_select ON public.subscription_plans
  FOR SELECT TO authenticated USING (active);

INSERT INTO public.subscription_plans (code, label, stripe_price_id, amount_eur, min_workers, max_workers, sort) VALUES
  ('petite',  'Petite équipe',  'price_1Tljz35QRvCYAnrFOdwVYURe', 49, 1, 15, 1),
  ('moyenne', 'Équipe moyenne', 'price_1TljzI5QRvCYAnrFBNTus1hz', 89, 16, 30, 2),
  ('grande',  'Grande équipe',  'price_1TljzY5QRvCYAnrFwkFSAROd', 149, 31, NULL, 3)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, stripe_price_id = EXCLUDED.stripe_price_id, amount_eur = EXCLUDED.amount_eur,
  min_workers = EXCLUDED.min_workers, max_workers = EXCLUDED.max_workers, sort = EXCLUDED.sort, active = true;
