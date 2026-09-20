-- 2026-09-20 — Étape 19 : le rôle « chef d'équipe ».
--
-- CE QU'IL PEUT. Voir et saisir les heures des salariés présents sur SON
-- chantier, le jour même. C'est la feuille d'heures d'équipe, celle que le chef
-- remplit le soir dans la camionnette.
--
-- CE QU'IL NE PEUT PAS, ET C'EST TOUT L'ENJEU. Taux horaires, coût des
-- chantiers, dépenses, paie, réglages, clôture de mois, facturation, nomination
-- de rôles : rien. `is_lead()` est VOLONTAIREMENT séparé de `is_admin()`, qui
-- lui renvoie faux. Un chef d'équipe n'est pas un administrateur au rabais : il
-- n'hérite d'aucun droit du bureau, et toute policy qui ne le nomme pas
-- explicitement lui reste fermée. C'est la seule construction qui reste juste
-- quand on ajoutera d'autres écrans au bureau : par défaut, il n'y a pas accès.
--
-- IL N'ENVOIE PAS À LA PLACE DE SES SALARIÉS. Il prépare un BROUILLON ; le
-- salarié envoie. Envoyer, c'est déclarer ses heures, et on ne déclare pas à la
-- place d'un autre. La base le refuse, pas seulement l'écran.
--
-- « SON ÉQUIPE » N'EST PAS UNE LISTE À TENIR. C'est qui partage son chantier ce
-- jour-là, lu dans le planning ET dans les heures déjà saisies — un renfort
-- envoyé le matin sans passer par le planning en fait partie. Une liste séparée
-- serait un écran de plus à maintenir, et elle serait fausse le jour où le
-- bureau déplace quelqu'un.
--
-- Conséquence vérifiée : le chef ne voit d'un collègue que les journées
-- PARTAGÉES. L'historique de ce collègue sur d'autres chantiers lui reste
-- invisible, ligne par ligne, date par date.
--
-- À exécuter AVANT de fusionner la PR. La première instruction ne peut pas être
-- dans la même transaction que les suivantes : à lancer seule.

ALTER TYPE public.battime_role ADD VALUE IF NOT EXISTS 'lead';

-- ─────────────────────────────────────────────────────────────────────────
-- Le reste, après validation de la valeur d'énumération ci-dessus.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_lead()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role::text = 'lead' AND is_active IS DISTINCT FROM false
  );
$fn$;

CREATE OR REPLACE FUNCTION public.is_my_team_member(p_user uuid, p_date date)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT public.is_lead()
     AND p_user IS NOT NULL
     AND p_date IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.id = p_user AND u.company_id = public.get_my_company_id()
     )
     AND EXISTS (
       SELECT 1
       FROM (
         SELECT p.worksite_id FROM public.planning p
          WHERE p.user_id = auth.uid() AND p.work_date = p_date AND p.worksite_id IS NOT NULL
         UNION
         SELECT t.worksite_id FROM public.time_entries t
          WHERE t.user_id = auth.uid() AND t.work_date = p_date AND t.worksite_id IS NOT NULL
            AND t.status <> 'cancelled'
       ) AS mine
       JOIN (
         SELECT p.worksite_id FROM public.planning p
          WHERE p.user_id = p_user AND p.work_date = p_date AND p.worksite_id IS NOT NULL
         UNION
         SELECT t.worksite_id FROM public.time_entries t
          WHERE t.user_id = p_user AND t.work_date = p_date AND t.worksite_id IS NOT NULL
            AND t.status <> 'cancelled'
       ) AS theirs ON theirs.worksite_id = mine.worksite_id
     );
$fn$;
REVOKE EXECUTE ON FUNCTION public.is_lead() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_my_team_member(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_lead() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_team_member(uuid, date) TO authenticated;

DROP POLICY IF EXISTS time_entries_select_company_admin_or_own_worker ON public.time_entries;
CREATE POLICY time_entries_select_company_admin_or_own_worker ON public.time_entries
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
     AND (public.is_admin() OR user_id = auth.uid() OR public.is_my_team_member(user_id, work_date)));

DROP POLICY IF EXISTS time_entries_lead_insert ON public.time_entries;
CREATE POLICY time_entries_lead_insert ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
          AND status = 'draft'
          AND public.is_my_team_member(user_id, work_date));

DROP POLICY IF EXISTS time_entries_lead_update ON public.time_entries;
CREATE POLICY time_entries_lead_update ON public.time_entries
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
     AND locked = false AND status IN ('draft', 'submitted')
     AND public.is_my_team_member(user_id, work_date))
  WITH CHECK (company_id = public.get_my_company_id()
     AND locked = false AND status IN ('draft', 'submitted', 'cancelled')
     AND public.is_my_team_member(user_id, work_date));

DROP POLICY IF EXISTS planning_worker_select_own ON public.planning;
CREATE POLICY planning_worker_select_own ON public.planning
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
     AND (public.is_admin() OR user_id = auth.uid() OR public.is_my_team_member(user_id, work_date)));

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid;
  v_target_company uuid;
  v_active boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''entreprise';
  END IF;
  IF p_role NOT IN ('admin', 'lead', 'worker') THEN
    RAISE EXCEPTION 'Rôle inconnu';
  END IF;

  v_company := public.get_my_company_id();
  SELECT u.company_id, u.is_active IS DISTINCT FROM false
    INTO v_target_company, v_active
  FROM public.users u WHERE u.id = p_user_id;

  IF v_target_company IS NULL OR v_target_company <> v_company THEN
    RAISE EXCEPTION 'Personne introuvable dans votre entreprise';
  END IF;
  IF p_role = 'admin' AND NOT v_active THEN
    RAISE EXCEPTION 'Ce compte est archivé. Réactivez-le avant de le nommer au bureau.';
  END IF;

  UPDATE public.users SET role = p_role::public.battime_role WHERE id = p_user_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
--     WHERE t.typname='battime_role' AND e.enumlabel='lead') AS role_lead,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public'
--     AND (qual::text LIKE '%is_my_team_member%' OR with_check::text LIKE '%is_my_team_member%')) AS policies_chef;
