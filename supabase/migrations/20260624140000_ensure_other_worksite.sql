-- 2026-06-24 — Chantier « Autre / Client inconnu » TOUJOURS disponible par entreprise.
--
-- Règle d'or Battime : l'heure n'est JAMAIS bloquée par le client. Un salarié qui
-- ne connaît pas son chantier doit pouvoir envoyer sa journée quand même : elle est
-- rattachée au chantier « Autre », et la secrétaire réattribue ensuite.
--
-- « Autre » est garanti par 3 mécanismes complémentaires :
--   1) créé à la création de l'entreprise (handle_new_user),
--   2) rétro-créé pour les entreprises existantes (backfill en bas),
--   3) auto-réparé s'il venait à manquer, via ensure_other_worksite() appelée par
--      l'app (filet de sécurité contre une suppression accidentelle).
--
-- NB : worksites.city est NOT NULL sans défaut → on insère '' (l'app affiche un
-- libellé dédié « Autre chantier / Travail non prévu » pour ce chantier).

-- ── 1) handle_new_user : pose aussi le chantier « Autre » à la création d'entreprise.
--    (Identique à l'existant — essai 30 j + rattachement admin — on ajoute juste
--     l'INSERT du chantier « Autre » dans la branche « nouvelle entreprise ».)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_first_name text;
  v_last_name text;
  v_role public.battime_role;
BEGIN
  v_company_name := nullif(new.raw_user_meta_data ->> 'company_name', '');
  v_first_name := nullif(new.raw_user_meta_data ->> 'first_name', '');
  v_last_name := nullif(new.raw_user_meta_data ->> 'last_name', '');
  v_role := COALESCE((nullif(new.raw_user_meta_data ->> 'role', ''))::public.battime_role, 'worker'::public.battime_role);

  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.companies (name, trial_ends_at)
    VALUES (v_company_name, now() + interval '30 days')
    RETURNING id INTO v_company_id;
    v_role := 'admin'::public.battime_role;
    -- Chantier « Autre / Client inconnu » toujours disponible pour cette entreprise.
    INSERT INTO public.worksites (company_id, client_name, city, is_active)
    VALUES (v_company_id, 'Autre', '', true);
  ELSE
    v_company_id := nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid;
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: missing company_name or company_id in user metadata for user id %', new.id;
    END IF;
  END IF;

  INSERT INTO public.users (id, company_id, first_name, last_name, role, email, phone)
  VALUES (
    new.id, v_company_id, v_first_name, v_last_name, v_role,
    nullif(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );

  RETURN new;
END;
$function$;

-- ── 2) Auto-réparation appelable par l'app (dérive l'entreprise de l'appelant via
--       auth.uid() — un utilisateur ne peut toucher QUE sa propre entreprise).
--       Idempotent : ne crée « Autre » que s'il manque, renvoie son id.
CREATE OR REPLACE FUNCTION public.ensure_other_worksite()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_id uuid;
BEGIN
  SELECT u.company_id INTO v_company FROM public.users u WHERE u.id = auth.uid();
  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT w.id INTO v_id
    FROM public.worksites w
    WHERE w.company_id = v_company AND w.client_name = 'Autre'
    LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.worksites (company_id, client_name, city, is_active)
    VALUES (v_company, 'Autre', '', true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_other_worksite() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_other_worksite() TO authenticated;

-- ── 3) Backfill : chaque entreprise existante sans « Autre » en reçoit un.
INSERT INTO public.worksites (company_id, client_name, city, is_active)
SELECT c.id, 'Autre', '', true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.worksites w
  WHERE w.company_id = c.id AND w.client_name = 'Autre'
);
