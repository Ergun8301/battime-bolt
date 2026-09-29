-- ════════════════════════════════════════════════════════════════════════════
-- VERROU DES INTERRUPTEURS kiosk_enabled ET ai_enabled
--
-- LE RISQUE. Les deux interrupteurs vivent sur `companies`, et un admin peut
-- déjà modifier la ligne de SON entreprise (nom, adresse, réglages…). Sans
-- garde, il pourrait donc allumer lui-même la borne ou l'IA — des fonctions
-- qu'Ergun active à la main, entreprise par entreprise.
--
-- LA GARDE. Un trigger BEFORE INSERT OR UPDATE refuse tout changement de ces
-- deux colonnes, sauf par la clé service (`service_role`) ou le propriétaire
-- de la base (`postgres`, éditeur SQL du tableau de bord Supabase). Il n'y a
-- donc qu'une façon de les activer :
--   UPDATE public.companies SET kiosk_enabled = true WHERE id = '…';
-- depuis l'éditeur SQL.
--
-- 100 % ADDITIF : une fonction neuve, un trigger neuf. Aucune policy existante
-- n'est touchée ; les autres colonnes restent modifiables exactement comme
-- avant. Le trigger ne fait rien quand les deux colonnes ne changent pas.
--
-- À APPLIQUER APRÈS les migrations des lots 1 et 2 (qui créent les colonnes).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_company_feature_flags()
 RETURNS trigger
 LANGUAGE plpgsql
 -- SECURITY INVOKER (défaut), VOLONTAIREMENT : `current_user` doit être celui
 -- qui écrit, pas le propriétaire de la fonction.
 SET search_path TO ''
AS $fn$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(new.kiosk_enabled, false) OR coalesce(new.ai_enabled, false) THEN
      RAISE EXCEPTION 'Activation réservée à BEMEXO (kiosk_enabled / ai_enabled).'
        USING ERRCODE = '42501';
    END IF;
    RETURN new;
  END IF;

  IF new.kiosk_enabled IS DISTINCT FROM old.kiosk_enabled
     OR new.ai_enabled IS DISTINCT FROM old.ai_enabled THEN
    RAISE EXCEPTION 'Activation réservée à BEMEXO (kiosk_enabled / ai_enabled).'
      USING ERRCODE = '42501';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.guard_company_feature_flags() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS companies_feature_flags_guard ON public.companies;
CREATE TRIGGER companies_feature_flags_guard
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_feature_flags();

-- Contrôle :
-- SELECT count(*) FROM pg_trigger WHERE tgname = 'companies_feature_flags_guard';  -- 1
