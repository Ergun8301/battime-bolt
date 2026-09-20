-- 2026-09-20 — Étape 15 : le webhook de paiement ne ment plus.
--
-- CE QUI ÉTAIT CASSÉ, ET CE QUE ÇA COÛTAIT.
--
-- 1) LES ÉCHECS D'ÉCRITURE ÉTAIENT AVALÉS. Le webhook faisait
--    `await admin.from('companies').update(...)` sans jamais regarder l'erreur,
--    puis répondait 200 à Stripe. Stripe considère alors l'événement délivré et
--    ne réessaie JAMAIS. Un client qui vient de payer reste bloqué derrière le
--    paywall, et rien nulle part ne le signale. C'est la pire version du
--    problème qu'on traque depuis le début : un succès affiché par-dessus un
--    échec silencieux — sauf qu'ici il est payant.
--
-- 2) UNE MISE À JOUR QUI NE TOUCHE AUCUNE LIGNE PASSAIT POUR UN SUCCÈS. Sans
--    `company_id` dans les métadonnées et sans `stripe_customer_id` connu, la
--    fonction ne faisait rien du tout et répondait quand même 200.
--
-- 3) AUCUNE PROTECTION CONTRE LES REJEUX NI CONTRE LE DÉSORDRE. Stripe rejoue
--    un événement tant qu'il n'a pas reçu un 2xx, et ne garantit PAS l'ordre
--    d'arrivée. Un `subscription.updated` (actif) délivré après un
--    `subscription.deleted` ressuscitait un abonnement résilié.
--
-- CE QUE CETTE TABLE APPORTE : la mémoire des événements déjà traités. Le
-- désordre, lui, est réglé autrement — la fonction relit l'abonnement chez
-- Stripe au lieu de croire le contenu de l'événement, donc elle écrit toujours
-- l'état COURANT et non celui d'un message en retard.
--
-- À exécuter AVANT de fusionner la PR.

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  event_created timestamptz,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_events IS
  'Événements Stripe déjà traités. La clé primaire EST la garantie : un rejeu ne peut pas être appliqué deux fois.';

CREATE INDEX IF NOT EXISTS stripe_events_processed_idx
  ON public.stripe_events (processed_at DESC);

-- Personne d'autre que le serveur. Aucune policy n'est créée : avec la RLS
-- active et aucune policy, `authenticated` et `anon` ne voient rien, et
-- `service_role` (qui contourne la RLS) écrit.
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_events FROM anon, authenticated;
GRANT ALL ON public.stripe_events TO service_role;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='stripe_events') AS table_evenements,
--   (SELECT relrowsecurity FROM pg_class WHERE oid='public.stripe_events'::regclass) AS rls_active,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='stripe_events') AS policies;
