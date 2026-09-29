-- ════════════════════════════════════════════════════════════════════════════
-- LOT 5 — ACCÈS SUPPORT BEMEXO (lecture seule, autorisé par le patron)
--
-- LE BESOIN. Quand un patron appelle « je ne vois pas les heures de Karim »,
-- le support doit pouvoir regarder SON écran. Jamais sans son accord, jamais
-- pour modifier, jamais au-delà de la durée qu'il a choisie, et tout est tracé.
--
-- LES QUATRE VERROUS, TOUS VÉRIFIÉS PAR LA BASE (pas par l'écran) :
--   1. le compte est dans `support_staff` (inscrit à la main, par SQL admin) ;
--   2. sa session a passé la double vérification : jeton `aal2` (MFA TOTP) ;
--   3. l'entreprise a une autorisation ACTIVE (non retirée, non expirée) ;
--   4. l'entreprise a `support_enabled` (interrupteur BEMEXO, défaut false).
-- Il suffit qu'UN verrou manque pour que `support_company_ids()` soit vide.
--
-- LECTURE SEULE. Le support ne reçoit que des policies SELECT. Aucune policy
-- INSERT / UPDATE / DELETE : la base refuse toute écriture de sa part.
--
-- 100 % ADDITIF.
--   • tables neuves (support_staff, support_grants, support_access_log) ;
--   • colonne neuve companies.support_enabled (défaut false) ;
--   • fonctions neuves, trigger neuf (le verrou existant n'est pas touché) ;
--   • policies neuves `support_read` AJOUTÉES à côté des existantes. En RLS,
--     les policies permissives s'additionnent (OU) : celles d'aujourd'hui ne
--     sont ni modifiées ni supprimées, et pour tout compte hors support_staff
--     la nouvelle condition est fausse — rien ne change pour eux.
--
-- VOLONTAIREMENT HORS D'ATTEINTE DU SUPPORT : bulletins (payslip_figures),
-- paie et n° de sécu (user_payroll), réglages de coût, invitations (jetons),
-- abonnements push, journaux techniques. Rien de ce qui touche au salaire.
--
-- ACTIVATION (éditeur SQL, après feu vert d'Ergun) :
--   UPDATE public.companies SET support_enabled = true WHERE id = '…';
--   INSERT INTO public.support_staff (user_id, label)
--     SELECT id, 'Ergun — support BEMEXO' FROM auth.users WHERE email = '…';
-- ════════════════════════════════════════════════════════════════════════════

-- ── Interrupteur ────────────────────────────────────────────────────────────
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS support_enabled boolean NOT NULL DEFAULT false;

-- Même principe que companies_feature_flags_guard, dans un trigger À PART pour
-- ne pas toucher à celui qui est déjà en production.
CREATE OR REPLACE FUNCTION public.guard_company_support_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 -- SECURITY INVOKER, volontairement : `current_user` doit être celui qui écrit.
 SET search_path TO ''
AS $fn$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN new;
  END IF;
  IF (TG_OP = 'INSERT' AND coalesce(new.support_enabled, false))
     OR (TG_OP = 'UPDATE' AND new.support_enabled IS DISTINCT FROM old.support_enabled) THEN
    RAISE EXCEPTION 'Activation réservée à BEMEXO (support_enabled).' USING ERRCODE = '42501';
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_company_support_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS companies_support_flag_guard ON public.companies;
CREATE TRIGGER companies_support_flag_guard
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_support_flag();

-- ── Comptes support ─────────────────────────────────────────────────────────
-- Personne ne la lit ni ne l'écrit depuis l'application : RLS sans policy.
-- Seules les fonctions ci-dessous (SECURITY DEFINER) la consultent.
CREATE TABLE IF NOT EXISTS public.support_staff (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_staff FROM anon, authenticated;

-- ── Autorisations données par le patron ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_grants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  -- 7 jours au plus, même si quelqu'un contournait la fonction.
  CONSTRAINT support_grants_duree CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days 1 minute')
);
-- Une seule autorisation ouverte par entreprise.
CREATE UNIQUE INDEX IF NOT EXISTS support_grants_une_ouverte ON public.support_grants (company_id) WHERE revoked_at IS NULL;
ALTER TABLE public.support_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_grants FROM anon, authenticated;
GRANT SELECT ON public.support_grants TO authenticated;
GRANT ALL ON public.support_grants TO service_role;
DROP POLICY IF EXISTS support_grants_admin_read ON public.support_grants;
CREATE POLICY support_grants_admin_read ON public.support_grants
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- ── Journal (lisible par le patron, non modifiable) ─────────────────────────
-- Pas de clé étrangère : le journal survit même à la suppression d'une entreprise.
CREATE TABLE IF NOT EXISTS public.support_access_log (
  id          bigserial PRIMARY KEY,
  company_id  uuid NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  event       text NOT NULL CHECK (event IN ('autorise', 'retire', 'entre', 'sort')),
  actor_id    uuid,
  actor_label text NOT NULL,
  detail      text
);
CREATE INDEX IF NOT EXISTS support_access_log_company ON public.support_access_log (company_id, at DESC);
ALTER TABLE public.support_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_access_log FROM anon, authenticated, service_role;
GRANT SELECT ON public.support_access_log TO authenticated, service_role;
DROP POLICY IF EXISTS support_access_log_admin_read ON public.support_access_log;
CREATE POLICY support_access_log_admin_read ON public.support_access_log
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- Même un rôle qui aurait le droit technique (propriétaire des fonctions,
-- clé service) ne peut ni corriger ni effacer une ligne.
CREATE OR REPLACE FUNCTION public.support_access_log_immuable()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'Journal du support : aucune modification ni suppression.' USING ERRCODE = '42501';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.support_access_log_immuable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS support_access_log_immuable ON public.support_access_log;
CREATE TRIGGER support_access_log_immuable
  BEFORE UPDATE OR DELETE ON public.support_access_log
  FOR EACH ROW EXECUTE FUNCTION public.support_access_log_immuable();
DROP TRIGGER IF EXISTS support_access_log_no_truncate ON public.support_access_log;
CREATE TRIGGER support_access_log_no_truncate
  BEFORE TRUNCATE ON public.support_access_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.support_access_log_immuable();

-- ── Le cœur : quelles entreprises CE compte support peut-il lire, maintenant ?
-- Vide pour tout le monde, sauf un compte support_staff en aal2, et seulement
-- pour les entreprises qui l'ont autorisé (et que BEMEXO a activées).
CREATE OR REPLACE FUNCTION public.support_company_ids()
 RETURNS uuid[]
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  SELECT coalesce(array_agg(g.company_id), '{}'::uuid[])
  FROM public.support_grants g
  JOIN public.companies c ON c.id = g.company_id AND c.support_enabled
  WHERE auth.uid() IS NOT NULL
    AND coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    AND EXISTS (SELECT 1 FROM public.support_staff s WHERE s.user_id = auth.uid())
    AND g.revoked_at IS NULL
    AND g.expires_at > now();
$fn$;
REVOKE EXECUTE ON FUNCTION public.support_company_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_company_ids() TO authenticated;

-- ── Patron : autoriser / retirer ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_grant(p_hours integer)
 RETURNS timestamptz
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid := public.get_my_company_id();
  v_until timestamptz;
  v_label text;
BEGIN
  IF v_company IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au patron.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company AND support_enabled) THEN
    RAISE EXCEPTION 'Accès support non disponible pour cette entreprise.' USING ERRCODE = '42501';
  END IF;
  IF p_hours NOT IN (1, 24, 168) THEN
    RAISE EXCEPTION 'Durée : 1 h, 24 h ou 7 jours.' USING ERRCODE = '22023';
  END IF;
  -- Une nouvelle autorisation remplace la précédente (jamais d'empilement).
  UPDATE public.support_grants SET revoked_at = now(), revoked_by = auth.uid()
   WHERE company_id = v_company AND revoked_at IS NULL;
  v_until := now() + make_interval(hours => p_hours);
  INSERT INTO public.support_grants (company_id, granted_by, expires_at) VALUES (v_company, auth.uid(), v_until);
  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), 'Le patron') INTO v_label
    FROM public.users WHERE id = auth.uid();
  INSERT INTO public.support_access_log (company_id, event, actor_id, actor_label, detail)
  VALUES (v_company, 'autorise', auth.uid(), v_label,
          CASE p_hours WHEN 1 THEN '1 heure' WHEN 24 THEN '24 heures' ELSE '7 jours' END);
  RETURN v_until;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.support_revoke()
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid := public.get_my_company_id();
  v_label text;
BEGIN
  IF v_company IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au patron.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.support_grants SET revoked_at = now(), revoked_by = auth.uid()
   WHERE company_id = v_company AND revoked_at IS NULL;
  IF FOUND THEN
    SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), 'Le patron') INTO v_label
      FROM public.users WHERE id = auth.uid();
    INSERT INTO public.support_access_log (company_id, event, actor_id, actor_label)
    VALUES (v_company, 'retire', auth.uid(), v_label);
  END IF;
END;
$fn$;

-- ── Support : savoir s'il est support, lister, entrer, sortir ───────────────
-- Vrai même sans MFA : l'écran sait alors qu'il faut demander le code.
CREATE OR REPLACE FUNCTION public.support_is_staff()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.support_staff WHERE user_id = auth.uid());
$fn$;

CREATE OR REPLACE FUNCTION public.support_my_companies()
 RETURNS TABLE (company_id uuid, name text, expires_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  SELECT c.id, c.name, g.expires_at
  FROM public.support_grants g
  JOIN public.companies c ON c.id = g.company_id
  WHERE g.company_id = ANY (public.support_company_ids())
    AND g.revoked_at IS NULL AND g.expires_at > now()
  ORDER BY c.name;
$fn$;

-- p_log = false : simple vérification au rechargement de la page (pas de ligne).
CREATE OR REPLACE FUNCTION public.support_enter(p_company uuid, p_log boolean DEFAULT true)
 RETURNS TABLE (name text, expires_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF p_company IS NULL OR NOT (p_company = ANY (public.support_company_ids())) THEN
    RAISE EXCEPTION 'Accès support non autorisé (ou expiré).' USING ERRCODE = '42501';
  END IF;
  IF p_log THEN
    INSERT INTO public.support_access_log (company_id, event, actor_id, actor_label)
    SELECT p_company, 'entre', auth.uid(), s.label FROM public.support_staff s WHERE s.user_id = auth.uid();
  END IF;
  RETURN QUERY
    SELECT c.name, g.expires_at FROM public.companies c
    JOIN public.support_grants g ON g.company_id = c.id AND g.revoked_at IS NULL
    WHERE c.id = p_company;
END;
$fn$;

-- La sortie est notée même après expiration (on sort justement parce que c'est fini).
CREATE OR REPLACE FUNCTION public.support_exit(p_company uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN RETURN; END IF;
  -- Seulement si ce compte est bien entré dans cette entreprise.
  IF NOT EXISTS (SELECT 1 FROM public.support_access_log
                  WHERE company_id = p_company AND actor_id = auth.uid() AND event = 'entre') THEN
    RETURN;
  END IF;
  INSERT INTO public.support_access_log (company_id, event, actor_id, actor_label)
  SELECT p_company, 'sort', auth.uid(), s.label FROM public.support_staff s WHERE s.user_id = auth.uid();
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.support_grant(integer), public.support_revoke(), public.support_is_staff(),
  public.support_my_companies(), public.support_enter(uuid, boolean), public.support_exit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_grant(integer), public.support_revoke(), public.support_is_staff(),
  public.support_my_companies(), public.support_enter(uuid, boolean), public.support_exit(uuid) TO authenticated;

-- ── Lecture seule pour le support : UNE policy SELECT de plus par table ─────
-- `(SELECT public.support_company_ids())` est calculé une fois par requête.
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'active_sessions', 'certifications', 'documents', 'kiosk_settings', 'kiosks',
    'leave_requests', 'month_closures', 'payroll_sends', 'planning', 'time_entries',
    'time_entry_corrections', 'time_entry_positions', 'users', 'worksite_expenses', 'worksites'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS support_read ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY support_read ON public.%I FOR SELECT TO authenticated '
        'USING (company_id = ANY ((SELECT public.support_company_ids())::uuid[]))', t);
    END IF;
  END LOOP;
END
$do$;

DROP POLICY IF EXISTS support_read ON public.companies;
CREATE POLICY support_read ON public.companies FOR SELECT TO authenticated
  USING (id = ANY ((SELECT public.support_company_ids())::uuid[]));

-- Contrôles :
-- SELECT count(*) FROM pg_policies WHERE policyname = 'support_read';          -- 16
-- SELECT count(*) FROM public.companies WHERE support_enabled;                 -- 0
-- SELECT count(*) FROM pg_trigger WHERE tgname = 'companies_support_flag_guard'; -- 1
