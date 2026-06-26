-- 2026-06-26 — Permettre au salarié (comme à la secrétaire) de renseigner
-- l'e-mail du client d'un chantier, pour pouvoir lui envoyer les documents.
--
-- Les salariés n'ont pas le droit d'écrire dans worksites (policy admin only).
-- Cette fonction SECURITY DEFINER, cloisonnée par entreprise (dérivée de
-- auth.uid()), autorise tout membre de l'entreprise à poser uniquement
-- l'e-mail du client. Aucun autre champ touché.

CREATE OR REPLACE FUNCTION public.set_worksite_client_email(p_worksite_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.users WHERE id = auth.uid();
  IF v_company IS NULL THEN RETURN; END IF;
  UPDATE public.worksites
     SET client_email = NULLIF(btrim(p_email), '')
   WHERE id = p_worksite_id AND company_id = v_company;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_worksite_client_email(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_worksite_client_email(uuid, text) TO authenticated;
