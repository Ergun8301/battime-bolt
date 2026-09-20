-- 2026-09-20 — Étape 13 : le coût d'un chantier, pour de vrai.
--
-- DEUX MENSONGES CORRIGÉS ICI.
--
-- 1) LE TEMPS DE ROUTE PAYÉ N'ÉTAIT NULLE PART DANS LE COÛT.
--    Depuis l'étape 7, le salarié dit si le trou entre deux interventions était
--    de la route ou une pause, et l'entreprise décide si la route est payée.
--    Depuis l'étape 8, ces minutes partent bien en paie et comptent dans les
--    heures supplémentaires. Mais le rapport « Coût chantiers » et les alertes
--    de budget, eux, ne lisaient que `total_minutes`. Conséquence : l'heure de
--    camion vers un chantier à 40 km était payée au salarié et INVISIBLE dans
--    le coût du chantier. Un chantier lointain paraissait aussi rentable qu'un
--    chantier au coin de la rue.
--
-- 2) « COÛT PAR CHANTIER » NE PARLAIT QUE DE MAIN D'ŒUVRE.
--    L'écran l'écrivait lui-même : « Hors matériaux et sous-traitance ». Le
--    patron lisait donc un chiffre dont il savait qu'il était faux, et devait
--    refaire le calcul ailleurs. Une table de dépenses est ajoutée.
--
-- POURQUOI LA RÈGLE DE ROUTE PASSE EN SQL : elle avait déjà DEUX
-- implémentations (l'export de paie côté navigateur, rien côté coût). En
-- ajouter une troisième dans la fonction d'alerte et une quatrième dans le
-- rapport garantissait qu'un jour deux écrans annonceraient deux chiffres.
-- Une seule fonction, appelée par le rapport ET par les alertes.
--
-- À exécuter AVANT de fusionner la PR.

-- ═══ 1) Le coût de main d'œuvre, route payée comprise ═════════════════════
--
-- Miroir exact de `routeMinutesByEntry` (lib/overtime.ts), qui reste utilisé
-- par l'export de paie parce qu'il travaille sur des lignes déjà chargées.
-- LES DEUX DOIVENT ÊTRE MODIFIÉES ENSEMBLE. L'égalité de leurs résultats a été
-- vérifiée sur les données de production avant la mise en service.
--
-- Le `max(...) OVER (… ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)`
-- reproduit le `prevEnd = max(prevEnd, end)` du code : deux interventions qui
-- se chevauchent ne doivent pas fabriquer du temps de route.
CREATE OR REPLACE FUNCTION public.worksite_labour(
  p_company uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
 RETURNS TABLE (
   worksite_id uuid,
   user_id uuid,
   worked_minutes bigint,
   route_minutes bigint,
   paid_minutes bigint,
   cost numeric,
   unpriced_minutes bigint
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH scoped AS (
    SELECT t.id, t.user_id, t.worksite_id, t.work_date, t.total_minutes, t.gap_before,
           (EXTRACT(hour FROM t.start_time) * 60 + EXTRACT(minute FROM t.start_time))::int AS start_min,
           CASE WHEN t.end_time < t.start_time THEN 1440 ELSE 0 END
             + (EXTRACT(hour FROM t.end_time) * 60 + EXTRACT(minute FROM t.end_time))::int AS end_min
    FROM public.time_entries t
    WHERE t.company_id = p_company
      -- Mêmes statuts que partout ailleurs : un brouillon ou une intervention
      -- retirée ne coûte rien à l'entreprise.
      AND t.status IN ('submitted', 'validated')
      AND t.worksite_id IS NOT NULL
      AND t.start_time IS NOT NULL AND t.end_time IS NOT NULL
      AND (p_from IS NULL OR t.work_date >= p_from)
      AND (p_to   IS NULL OR t.work_date <= p_to)
  ),
  gapped AS (
    SELECT s.*,
           max(s.end_min) OVER (
             PARTITION BY s.user_id, s.work_date
             ORDER BY s.start_min, s.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS prev_end
    FROM scoped s
  ),
  priced AS (
    SELECT g.worksite_id,
           g.user_id,
           g.total_minutes,
           CASE
             WHEN g.gap_before = 'route'
              AND g.prev_end IS NOT NULL
              AND g.start_min > g.prev_end
              -- Le réglage de l'entreprise, lu ici : un appelant ne peut pas
              -- se tromper en l'oubliant.
              AND COALESCE((SELECT c.travel_paid FROM public.companies c WHERE c.id = p_company), false)
             THEN g.start_min - g.prev_end
             ELSE 0
           END AS route_min,
           (SELECT up.hourly_rate FROM public.user_payroll up
             WHERE up.user_id = g.user_id AND up.company_id = p_company) AS rate
    FROM gapped g
  )
  SELECT p.worksite_id,
         p.user_id,
         sum(p.total_minutes)::bigint                        AS worked_minutes,
         sum(p.route_min)::bigint                            AS route_minutes,
         sum(p.total_minutes + p.route_min)::bigint          AS paid_minutes,
         COALESCE(sum((p.total_minutes + p.route_min) / 60.0 * p.rate), 0)::numeric AS cost,
         -- Minutes qu'on sait ne PAS avoir chiffrées : sans ce compte, un coût
         -- partiel passerait pour un coût complet.
         COALESCE(sum(p.total_minutes + p.route_min) FILTER (WHERE p.rate IS NULL), 0)::bigint AS unpriced_minutes
  FROM priced p
  GROUP BY p.worksite_id, p.user_id;
$function$;
-- ELLE N'EST PAS OUVERTE AU RÔLE CONNECTÉ, ET C'EST ESSENTIEL.
-- Elle prend l'entreprise EN PARAMÈTRE et ne vérifie pas qui appelle : ouverte
-- à `authenticated`, n'importe quel salarié l'appellerait avec l'identifiant de
-- son entreprise — ou de n'importe quelle autre — et lirait les minutes et le
-- coût par salarié, donc les taux horaires de ses collègues par division. Le
-- contrôle d'accès vit dans `my_worksite_labour` ci-dessous, et un portier ne
-- sert à rien si la porte de service reste ouverte.
-- `budget-alerts` l'appelle en service_role, hors RLS, et c'est le seul.
REVOKE EXECUTE ON FUNCTION public.worksite_labour(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worksite_labour(uuid, date, date) TO service_role;

-- La porte d'entrée du bureau : elle ne prend pas d'entreprise en paramètre,
-- elle la déduit de la session, et elle exige d'être admin. SECURITY DEFINER
-- lui permet d'appeler la fonction interne malgré le retrait ci-dessus.
CREATE OR REPLACE FUNCTION public.my_worksite_labour(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
 RETURNS TABLE (
   worksite_id uuid, user_id uuid, worked_minutes bigint, route_minutes bigint,
   paid_minutes bigint, cost numeric, unpriced_minutes bigint
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''entreprise';
  END IF;
  RETURN QUERY SELECT * FROM public.worksite_labour(public.get_my_company_id(), p_from, p_to);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.my_worksite_labour(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_worksite_labour(date, date) TO authenticated;

-- ═══ 2) Les dépenses de chantier ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.worksite_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  worksite_id uuid NOT NULL REFERENCES public.worksites(id) ON DELETE CASCADE,
  spent_on date NOT NULL DEFAULT current_date,
  category text NOT NULL,
  label text,
  supplier text,
  -- En euros. Un montant négatif serait un avoir : accepté, mais pas zéro,
  -- qui ne veut rien dire et fausserait la liste.
  amount numeric(12, 2) NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worksite_expenses_category_check
    CHECK (category IN ('materiaux', 'sous_traitance', 'location', 'autre')),
  CONSTRAINT worksite_expenses_amount_check CHECK (amount <> 0)
);

COMMENT ON TABLE public.worksite_expenses IS
  'Dépenses d''un chantier hors main d''œuvre : matériaux, sous-traitance, location, divers. Saisies par le bureau.';

CREATE INDEX IF NOT EXISTS worksite_expenses_site_idx
  ON public.worksite_expenses (company_id, worksite_id, spent_on DESC);

ALTER TABLE public.worksite_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worksite_expenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksite_expenses TO authenticated;
GRANT ALL ON public.worksite_expenses TO service_role;

-- Lecture ET écriture réservées au bureau. Ce sont des montants d'achat : un
-- salarié n'a pas à connaître les marges de son employeur, et le taux horaire
-- suit déjà cette règle (user_payroll).
DROP POLICY IF EXISTS worksite_expenses_admin_all ON public.worksite_expenses;
CREATE POLICY worksite_expenses_admin_all ON public.worksite_expenses
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());

-- Le chantier appartient bien à l'entreprise de la dépense — sans quoi une
-- dépense pourrait être rangée dans le chantier d'un concurrent.
CREATE OR REPLACE FUNCTION public.guard_worksite_expense_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.worksites w
                 WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'worksite_expenses: chantier hors de votre entreprise';
  END IF;
  RETURN new;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.guard_worksite_expense_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS worksite_expenses_guard ON public.worksite_expenses;
CREATE TRIGGER worksite_expenses_guard
  BEFORE INSERT OR UPDATE ON public.worksite_expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_worksite_expense_write();

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname IN ('worksite_labour','my_worksite_labour')) AS fonctions,
--   (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='worksite_expenses') AS table_depenses,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='worksite_expenses') AS policies,
--   (SELECT count(*) FROM pg_trigger WHERE tgname='worksite_expenses_guard') AS garde;
