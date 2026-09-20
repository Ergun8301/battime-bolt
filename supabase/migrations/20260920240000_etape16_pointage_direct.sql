-- 2026-09-20 — Étape 16 : le pointage en direct.
--
-- LE PROBLÈME QU'IL RÈGLE. Aujourd'hui le salarié tape ses heures de mémoire,
-- souvent le soir ou le lendemain. C'est la source de presque tous les défauts
-- qu'on a corrigés dans ce plan : les journées oubliées, les brouillons jamais
-- envoyés, les trois interventions du dimanche restées en attente. Pointer en
-- arrivant et en partant supprime la mémoire de l'équation.
--
-- LA RÈGLE QUI COMMANDE TOUT LE RESTE : UN CHRONO EN COURS N'EST PAS UNE HEURE
-- TRAVAILLÉE. Tant que le salarié n'a pas fermé sa journée, rien ne doit être
-- compté — ni en paie, ni dans le coût chantier, ni dans les totaux, ni dans
-- les alertes de budget.
--
-- D'où une TABLE SÉPARÉE plutôt qu'une ligne « incomplète » dans time_entries.
-- Si le chrono vivait dans time_entries, chaque lecture existante devrait
-- penser à l'exclure : l'export de paie, le rapport de coût, le récapitulatif
-- hebdomadaire, les alertes, la fonction worksite_labour… Il suffirait d'un
-- oubli pour qu'un chrono ouvert depuis 14 heures parte en paie. Ici, l'oubli
-- est impossible : les lectures existantes ne connaissent pas cette table.
--
-- ET SURTOUT : ON NE DEVINE JAMAIS L'HEURE DE FIN. Un salarié qui oublie de
-- fermer ne produit pas une journée de 15 heures, et pas non plus une journée
-- tronquée à une heure inventée. On lui DEMANDE à quelle heure il a fini, comme
-- on lui demande déjà si un trou était de la route ou une pause.
--
-- À exécuter AVANT de fusionner la PR.

CREATE TABLE IF NOT EXISTS public.active_sessions (
  -- Un seul chrono par salarié : la clé primaire est la règle.
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  worksite_id uuid NOT NULL REFERENCES public.worksites(id) ON DELETE CASCADE,
  planning_id uuid REFERENCES public.planning(id) ON DELETE SET NULL,
  -- Le jour de chantier auquel le chrono se rattache, et l'instant de départ.
  work_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.active_sessions IS
  'Chronos en cours. Volontairement HORS de time_entries : aucune lecture de paie, de coût ou de récapitulatif ne peut les compter par inadvertance.';

CREATE INDEX IF NOT EXISTS active_sessions_company_idx
  ON public.active_sessions (company_id, work_date);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.active_sessions FROM anon;
GRANT SELECT, INSERT, DELETE ON public.active_sessions TO authenticated;
GRANT ALL ON public.active_sessions TO service_role;

-- Le bureau voit les chronos de son entreprise (pour savoir qui est sur quel
-- chantier en ce moment) ; le salarié ne voit que le sien.
DROP POLICY IF EXISTS active_sessions_select ON public.active_sessions;
CREATE POLICY active_sessions_select ON public.active_sessions
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));

-- Un salarié ouvre et ferme SON chrono. Le bureau peut fermer celui d'un
-- salarié (téléphone cassé, oubli persistant) mais pas en ouvrir un à sa place :
-- pointer à la place de quelqu'un, c'est déclarer des heures qu'on n'a pas
-- faites.
DROP POLICY IF EXISTS active_sessions_insert_own ON public.active_sessions;
CREATE POLICY active_sessions_insert_own ON public.active_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_my_company_id());

DROP POLICY IF EXISTS active_sessions_delete ON public.active_sessions;
CREATE POLICY active_sessions_delete ON public.active_sessions
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));

-- Le chantier appartient bien à l'entreprise, et le mois n'est pas clôturé.
CREATE OR REPLACE FUNCTION public.guard_active_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.worksites w
                 WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'active_sessions: chantier hors de votre entreprise';
  END IF;
  IF public.is_month_closed(new.company_id, new.work_date) THEN
    RAISE EXCEPTION 'active_sessions: le mois est clôturé par le bureau';
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_active_session() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS active_sessions_guard ON public.active_sessions;
CREATE TRIGGER active_sessions_guard
  BEFORE INSERT OR UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_session();

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='active_sessions') AS table_chronos,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='active_sessions') AS policies,
--   (SELECT count(*) FROM pg_trigger WHERE tgname='active_sessions_guard') AS garde;
