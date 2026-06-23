-- 2026-06-23 — Durcissement sécurité avant commercialisation.
-- Appliqué en production (projet sdperbcquvneohotjono). Versionné ici pour
-- pouvoir le rejouer le jour où l'on crée une base de STAGING.
--
-- Effet : alertes sécurité Supabase passées de 11 à 3 (les 2 restantes sur
-- is_admin/get_my_company_id sont VOULUES — la RLS en a besoin pour le rôle
-- authenticated ; la 3e, "leaked password protection", est un toggle dashboard).
-- Vérifié : l'inscription patron crée toujours entreprise + admin (le trigger
-- handle_new_user est SECURITY DEFINER et contourne la RLS).

-- 1) companies : retirer les politiques INSERT trop permissives (WITH CHECK true).
DROP POLICY IF EXISTS companies_anon_insert ON public.companies;
DROP POLICY IF EXISTS companies_authenticated_insert ON public.companies;

-- 2) Couper l'exécution RPC des fonctions internes (trigger / event trigger).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- 3) is_admin / get_my_company_id : utilisées par la RLS pour 'authenticated'
--    → on garde 'authenticated', on retire 'anon'/public.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_company_id() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated;
