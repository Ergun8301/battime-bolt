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
     -- LE JOUR MÊME, et rien d'autre. Sans cette borne, un chef pouvait lire et
     -- modifier n'importe quelle journée passée ou future partagée avec un
     -- collègue, via l'API — alors que le rôle et l'écran ne parlent que
     -- d'aujourd'hui. Une promesse tenue par l'interface seule n'en est pas une.
     AND p_date = (now() AT TIME ZONE 'Europe/Paris')::date
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
     AND locked = false AND status IN ('draft', 'submitted')
     AND public.is_my_team_member(user_id, work_date));

-- Un chef ne change JAMAIS le statut d'une ligne qui n'est pas la sienne.
-- La RLS ne voit que la NOUVELLE ligne : elle ne peut pas interdire la
-- transition brouillon → envoyé. C'est donc le garde qui la tient. Sans lui, un
-- chef pouvait envoyer les heures de son équipe par un simple appel à l'API,
-- alors que l'écran, la documentation et cette PR affirment le contraire.
-- Corriger les heures d'un autre, oui ; décider de leur sort — envoyer, retirer
-- — non : ces deux gestes appartiennent au salarié.
CREATE OR REPLACE FUNCTION public.guard_time_entry_write()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN new;
  END IF;

  IF public.is_month_closed(new.company_id, new.work_date)
     AND current_setting('bemexo.allow_reserve_fix', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'time_entries: le mois est clôturé par le bureau';
  END IF;

  IF TG_OP = 'INSERT' THEN
    new.locked       := false;
    new.exported_at  := NULL;
    new.validated_at := NULL;
    new.validated_by := NULL;
    new.modified_at  := NULL;
    new.modified_by  := NULL;
    new.submitted_at := NULL;
    new.reserve_resolved_at := NULL;
    new.reserve_resolved_by := NULL;
    new.reserve_resolution  := NULL;
    new.reserve_fixed_at := NULL;
    new.reserve_fixed_by := NULL;
    new.reserve_fix_note := NULL;
    IF new.user_id IS DISTINCT FROM auth.uid() THEN
      new.status := 'draft';
    END IF;
  ELSE
    new.user_id      := old.user_id;
    new.company_id   := old.company_id;
    new.work_date    := old.work_date;
    new.locked       := old.locked;
    new.exported_at  := old.exported_at;
    new.validated_at := old.validated_at;
    new.validated_by := old.validated_by;
    new.client_id    := old.client_id;
    new.reserve_resolved_at := old.reserve_resolved_at;
    new.reserve_resolved_by := old.reserve_resolved_by;
    new.reserve_resolution  := old.reserve_resolution;

    IF current_setting('bemexo.allow_reserve_fix', true) IS DISTINCT FROM '1' THEN
      new.reserve_fixed_at := old.reserve_fixed_at;
      new.reserve_fixed_by := old.reserve_fixed_by;
      new.reserve_fix_note := old.reserve_fix_note;
    END IF;

    IF old.user_id IS DISTINCT FROM auth.uid() THEN
      new.status := old.status;
    END IF;

    IF old.status = 'submitted' AND new.status = 'draft' THEN
      RAISE EXCEPTION 'time_entries: une journée envoyée ne redevient pas brouillon (retirez-la ou corrigez-la)';
    END IF;
    IF old.status = 'cancelled' AND new.status <> 'cancelled' THEN
      RAISE EXCEPTION 'time_entries: une intervention retirée ne se réactive pas';
    END IF;

    IF old.status = 'submitted' AND (
         new.status = 'cancelled'
      OR (new.start_time, new.end_time, new.break_minutes, new.meal_allowance, new.observation, new.reception, new.worksite_id, new.photos, new.gap_before)
         IS DISTINCT FROM
         (old.start_time, old.end_time, old.break_minutes, old.meal_allowance, old.observation, old.reception, old.worksite_id, old.photos, old.gap_before)
    ) THEN
      new.modified_at := now();
      new.modified_by := auth.uid();
    ELSE
      new.modified_at := old.modified_at;
      new.modified_by := old.modified_by;
    END IF;

    IF new.status = 'submitted' AND old.status = 'draft' THEN
      new.submitted_at := now();
    ELSE
      new.submitted_at := old.submitted_at;
    END IF;
  END IF;

  IF new.worksite_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.worksites w
       WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'time_entries: chantier hors de votre entreprise';
  END IF;
  RETURN new;
END;
$fn$;

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
