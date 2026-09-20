-- 2026-09-20 — Étape 10 bis : un envoi au comptable ne part jamais deux fois.
--
-- LE TROU CORRIGÉ ICI. La fonction envoie le tableur à Resend, Resend l'accepte,
-- puis la réponse se perd en route (le bureau change de réseau, le téléphone se
-- met en veille, le tunnel coupe). Côté navigateur, `invoke` rend une erreur.
-- On affichait « l'envoi a échoué », on laissait les heures déverrouillées, et
-- le bureau recliquait. Résultat : le comptable recevait DEUX tableurs, et si
-- une heure avait été corrigée entre-temps, deux tableurs DIFFÉRENTS, sans
-- moyen de savoir lequel fait foi.
--
-- Une erreur de transport ne prouve pas qu'aucun e-mail n'est parti. Il faut
-- une trace côté serveur, écrite par l'envoi lui-même.
--
-- À exécuter AVANT de fusionner la PR.

CREATE TABLE IF NOT EXISTS public.payroll_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Empreinte du fichier réellement expédié (contenu + période). Deux clics sur
  -- le même export donnent la même clé ; un export refait après correction des
  -- heures en donne une autre, et part donc légitimement.
  idempotency_key text NOT NULL,
  period_label text,
  recipient text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT payroll_sends_unique_key UNIQUE (company_id, idempotency_key)
);

COMMENT ON TABLE public.payroll_sends IS
  'Un envoi de paie abouti. Sert à ne pas renvoyer deux fois le même fichier quand la réponse s''est perdue, et à prévenir le bureau qu''un export de la même période était déjà parti.';

CREATE INDEX IF NOT EXISTS payroll_sends_company_sent_idx
  ON public.payroll_sends (company_id, sent_at DESC);

ALTER TABLE public.payroll_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_sends FROM anon;
-- Lecture seule pour le bureau : la ligne est écrite par la fonction serveur,
-- jamais par le navigateur — sinon la trace ne prouverait plus rien.
GRANT SELECT ON public.payroll_sends TO authenticated;
GRANT ALL ON public.payroll_sends TO service_role;

DROP POLICY IF EXISTS payroll_sends_admin_select ON public.payroll_sends;
CREATE POLICY payroll_sends_admin_select ON public.payroll_sends
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='payroll_sends') AS table_envois,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='payroll_sends') AS policies,
--   (SELECT count(*) FROM pg_constraint WHERE conname='payroll_sends_unique_key') AS cle_unique;
