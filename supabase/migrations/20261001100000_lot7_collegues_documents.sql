-- Lot 7 — IA v2 : planning des collègues (salarié) et catégorie des documents.
--
-- 100 % ADDITIF : deux colonnes neuves AVEC valeur par défaut, trois fonctions
-- neuves. Aucune policy ni fonction existante modifiée.
--
-- 1) « Où sont mes collègues ? » : un salarié ne lit TOUJOURS PAS la table
--    `planning` des autres (sa RLS ne change pas). Il passe par une fonction
--    qui ne rend QUE trois choses : le prénom, le chantier (nom + ville) et les
--    horaires prévus — ou « absent », sans le motif. Jamais d'heures pointées,
--    jamais de coût. Réglage de l'entreprise, ACTIVÉ par défaut (demande
--    d'Ergun), désactivable par le bureau.
-- 2) Documents de chantier : une catégorie (facture payée, facture, devis,
--    réserve, photo, plan, PV de réception, autre). Vide pour l'existant.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS colleagues_planning_visible boolean NOT NULL DEFAULT true;

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS category text
  CHECK (category IS NULL OR category IN ('facture_payee', 'facture', 'devis', 'reserve', 'photo', 'plan', 'pv_reception', 'autre'));

-- Planning des collègues : 14 jours au plus, SON entreprise, jamais soi-même.
CREATE OR REPLACE FUNCTION public.colleagues_planning(p_from date, p_to date)
 RETURNS TABLE (prenom text, work_date date, chantier text, ville text, debut time, fin time, absent boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid := public.get_my_company_id();
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Session invalide.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 14 THEN
    RAISE EXCEPTION 'Période invalide (14 jours au plus).' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.colleagues_planning_visible) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT coalesce(nullif(trim(u.first_name), ''), 'Collègue')::text,
           p.work_date,
           CASE WHEN p.absence_type IS NULL THEN w.client_name END::text,
           CASE WHEN p.absence_type IS NULL THEN nullif(w.city, '') END::text,
           CASE WHEN p.absence_type IS NULL THEN p.estimated_start END,
           CASE WHEN p.absence_type IS NULL THEN p.estimated_end END,
           (p.absence_type IS NOT NULL)
    FROM public.planning p
    JOIN public.users u ON u.id = p.user_id AND u.company_id = v_company AND u.is_active IS DISTINCT FROM false
    LEFT JOIN public.worksites w ON w.id = p.worksite_id AND w.company_id = v_company
    WHERE p.company_id = v_company
      AND p.work_date BETWEEN p_from AND p_to
      AND p.user_id <> auth.uid()
    ORDER BY p.work_date, 1, p.estimated_start NULLS LAST;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.colleagues_planning(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colleagues_planning(date, date) TO authenticated;

-- Réglage « Les salariés voient le planning de leurs collègues » : le bureau seulement.
CREATE OR REPLACE FUNCTION public.set_colleagues_planning(p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid := public.get_my_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.companies SET colleagues_planning_visible = coalesce(p_enabled, true) WHERE id = v_company;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_colleagues_planning(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_colleagues_planning(boolean) TO authenticated;
