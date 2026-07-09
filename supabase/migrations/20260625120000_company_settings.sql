-- 2026-06-25 — Réglages de l'entreprise (étape 2/3).
-- Tout est ADDITIF et n'affecte ni Stripe ni les données existantes.
--   1) colonne TVA intracommunautaire (facultative) sur companies ;
--   2) fonction update_company_info : écriture SÛRE des seuls champs « humains »
--      (jamais subscription_status / stripe_* / trial_ends_at / is_active),
--      réservée à l'ADMIN de SA propre entreprise ;
--   3) bucket Storage « company-logos » (lecture publique pour afficher le logo,
--      écriture réservée à l'admin de l'entreprise, dans son dossier {company_id}/…).
-- Tous les champs sont facultatifs : un champ vide est mis à NULL, jamais d'erreur.
-- Exception : companies.name est NOT NULL → si laissé vide, on conserve l'ancien.

-- 1) TVA intracommunautaire (anticipation facturation électronique).
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tva_intra text;

-- 2) Écriture sûre, champs humains uniquement, admin de sa boîte.
CREATE OR REPLACE FUNCTION public.update_company_info(
  p_name text,
  p_siret text,
  p_tva_intra text,
  p_address text,
  p_postal_code text,
  p_city text,
  p_phone text,
  p_email text,
  p_logo_url text
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_role public.battime_role;
BEGIN
  SELECT u.company_id, u.role INTO v_company, v_role
  FROM public.users u WHERE u.id = auth.uid();
  IF v_company IS NULL OR v_role::text <> 'admin' THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''entreprise';
  END IF;

  UPDATE public.companies SET
    name        = COALESCE(nullif(btrim(p_name), ''), name),  -- NOT NULL : on garde l'ancien si vide
    siret       = nullif(btrim(p_siret), ''),
    tva_intra   = nullif(btrim(p_tva_intra), ''),
    address     = nullif(btrim(p_address), ''),
    postal_code = nullif(btrim(p_postal_code), ''),
    city        = nullif(btrim(p_city), ''),
    phone       = nullif(btrim(p_phone), ''),
    email       = nullif(btrim(p_email), ''),
    logo_url    = nullif(btrim(p_logo_url), '')
  WHERE id = v_company;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_company_info(text,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_company_info(text,text,text,text,text,text,text,text,text) TO authenticated;

-- 3) Bucket des logos (lecture publique, écriture par l'admin de l'entreprise).
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company_logos_public_read" ON storage.objects;
CREATE POLICY "company_logos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "company_logos_admin_insert" ON storage.objects;
CREATE POLICY "company_logos_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND public.is_admin()
             AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

DROP POLICY IF EXISTS "company_logos_admin_update" ON storage.objects;
CREATE POLICY "company_logos_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND public.is_admin()
         AND (storage.foldername(name))[1] = public.get_my_company_id()::text)
  WITH CHECK (bucket_id = 'company-logos' AND public.is_admin()
             AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

DROP POLICY IF EXISTS "company_logos_admin_delete" ON storage.objects;
CREATE POLICY "company_logos_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND public.is_admin()
         AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
