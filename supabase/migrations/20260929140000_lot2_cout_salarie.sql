-- ════════════════════════════════════════════════════════════════════════════
-- COÛT RÉEL D'UN SALARIÉ, À PARTIR DU BULLETIN DE PAIE (lot 2)
--
-- 100 % ADDITIF : une colonne neuve (valeur par défaut false), deux tables
-- neuves. Aucune table, policy ou fonction existante n'est modifiée. Le taux
-- horaire saisi à la main (`user_payroll.hourly_rate`) et tous les calculs qui
-- l'utilisent restent EXACTEMENT comme avant : le coût réel s'affiche à côté.
--
-- INTERRUPTEUR : `companies.ai_enabled`, faux par défaut (servira aussi aux
-- lots 3 et 4). Tant qu'il est faux, rien de nouveau n'apparaît et la
-- fonction `payslip-read` refuse tout. Activation à la main :
--   UPDATE public.companies SET ai_enabled = true WHERE id = '…';
--
-- CONFIDENTIALITÉ : le FICHIER du bulletin n'est jamais stocké (ni ici, ni
-- dans le storage). Seuls quatre chiffres validés par l'admin sont gardés :
-- mois, brut, total employeur, heures payées. Jamais le n° de sécurité sociale.
--
-- ACCÈS : l'admin de l'entreprise UNIQUEMENT. Un salarié ne voit ni son coût
-- ni celui des autres : aucune policy ne lui ouvre ces tables.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false;

-- ── Chiffres validés d'un bulletin ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payslip_figures (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Premier jour du mois du bulletin.
  month          date        NOT NULL CHECK (extract(day FROM month) = 1),
  gross          numeric(10,2) NOT NULL CHECK (gross > 0),
  employer_total numeric(10,2) NOT NULL,
  paid_hours     numeric(6,2)  NOT NULL CHECK (paid_hours BETWEEN 1 AND 250),
  -- 'ai' = lu par l'IA puis validé ; 'manual' = saisi à la main.
  source         text        NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  created_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Le total employeur inclut le brut : il lui est forcément supérieur.
  CHECK (employer_total > gross),
  -- Un bulletin par salarié et par mois : revalider le même mois le remplace.
  UNIQUE (user_id, month)
);
CREATE INDEX IF NOT EXISTS payslip_figures_company_idx ON public.payslip_figures (company_id, user_id, month DESC);

COMMENT ON TABLE public.payslip_figures IS
  'Quatre chiffres validés par l''admin à partir d''un bulletin (le fichier n''est jamais conservé). Admin de l''entreprise uniquement.';

-- ── Réglage « Caisse de congés BTP » ───────────────────────────────────────
-- Table à part plutôt que colonnes sur `companies` : ses droits sont les
-- siens (admin uniquement), sans toucher aux policies existantes de `companies`.
CREATE TABLE IF NOT EXISTS public.company_cost_settings (
  company_id         uuid        PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  btp_leave_enabled  boolean     NOT NULL DEFAULT false,
  btp_leave_rate     numeric(5,2) NOT NULL DEFAULT 20.70 CHECK (btp_leave_rate >= 0 AND btp_leave_rate <= 50),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── RLS : l'admin de SON entreprise, personne d'autre ──────────────────────
ALTER TABLE public.payslip_figures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_cost_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payslip_figures, public.company_cost_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslip_figures, public.company_cost_settings TO authenticated;
GRANT ALL ON public.payslip_figures, public.company_cost_settings TO service_role;

DROP POLICY IF EXISTS payslip_figures_admin ON public.payslip_figures;
CREATE POLICY payslip_figures_admin ON public.payslip_figures
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (
    company_id = public.get_my_company_id() AND public.is_admin()
    -- Le salarié doit appartenir à la même entreprise.
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = payslip_figures.user_id AND u.company_id = payslip_figures.company_id)
  );

DROP POLICY IF EXISTS company_cost_settings_admin ON public.company_cost_settings;
CREATE POLICY company_cost_settings_admin ON public.company_cost_settings
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_name = 'companies' AND column_name = 'ai_enabled') AS interrupteur,
--   (SELECT count(*) FROM pg_policies WHERE tablename IN ('payslip_figures', 'company_cost_settings')) AS policies_2,
--   (SELECT count(*) FROM public.companies WHERE ai_enabled) AS entreprises_actives_0;
