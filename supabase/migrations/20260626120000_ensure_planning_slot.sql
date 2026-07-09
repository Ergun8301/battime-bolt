-- 2026-06-26 — Unification des interventions ajoutées par le salarié.
--
-- Quand un salarié déclare des heures sur un chantier NON planifié, on crée le
-- créneau de planning correspondant → il devient une bulle normale côté secrétaire
-- (glissable + même pop-up), avec un repère `added_by_worker` pour savoir que c'est
-- le salarié qui l'a ajouté.
--
-- Sûr : SECURITY DEFINER, cloisonné par entreprise (dérivée de auth.uid()),
-- idempotent (ne crée que si le créneau manque). N'affecte PAS la paie (qui lit
-- time_entries) ni le poseur (le créneau d'un chantier déjà déclaré n'apparaît pas
-- en double : plannedTodo filtre par les chantiers déclarés).

ALTER TABLE public.planning ADD COLUMN IF NOT EXISTS added_by_worker boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ensure_planning_slot(p_user_id uuid, p_work_date date, p_worksite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid;
BEGIN
  IF p_worksite_id IS NULL THEN RETURN; END IF;
  SELECT company_id INTO v_company FROM public.users WHERE id = auth.uid();
  IF v_company IS NULL THEN RETURN; END IF;
  -- le salarié cible ET le chantier doivent appartenir à l'entreprise de l'appelant
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND company_id = v_company) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.worksites WHERE id = p_worksite_id AND company_id = v_company) THEN RETURN; END IF;
  -- idempotent : ne crée que si le créneau n'existe pas déjà
  IF EXISTS (SELECT 1 FROM public.planning WHERE user_id = p_user_id AND work_date = p_work_date AND worksite_id = p_worksite_id) THEN RETURN; END IF;
  INSERT INTO public.planning (company_id, user_id, work_date, worksite_id, added_by_worker)
  VALUES (v_company, p_user_id, p_work_date, p_worksite_id, true);
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_planning_slot(uuid, date, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_planning_slot(uuid, date, uuid) TO authenticated;
