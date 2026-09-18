-- 2026-09-18 — Étape 2 : sécurité de base (suite de l'audit).
--
-- À exécuter AVANT de fusionner la PR de l'étape 2, APRÈS avoir déployé la
-- nouvelle fonction edge invite-worker (elle pose l'invitation avant le compte,
-- ce que le trigger ci-dessous exige). Le bloc 8 s'exécute APRÈS la fusion.
--
-- 1) Un salarié archivé n'a plus d'entreprise, donc plus aucun droit.
-- 2) On ne rejoint une entreprise existante QUE sur invitation (plus de
--    company_id / role pris dans les métadonnées d'un signUp public).
-- 3) accepted_at des invitations posé à la première connexion.
-- 4) Policies salarié sur time_entries cloisonnées par entreprise.
-- 5) Colonnes de cycle de vie (verrou, export, auteur, date) protégées par
--    trigger : le salarié ne peut plus les réécrire par l'API.
-- 6) planning / worksites : mêmes gardes ; ensure_planning_slot pour soi-même.
-- 7) Données de paie (NIR, embauche, contrat, taux) dans user_payroll,
--    lisible et modifiable par le bureau uniquement.
-- 8) (après fusion) suppression des anciennes colonnes de users.

-- ── 1) Appartenance active ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT u.company_id
  FROM public.users u
  WHERE u.id = auth.uid() AND u.is_active IS DISTINCT FROM false
  LIMIT 1;
$$;

-- La fiche entreprise suit la même règle (un archivé ne la lit plus).
DROP POLICY IF EXISTS companies_select_own_company ON public.companies;
CREATE POLICY companies_select_own_company ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.get_my_company_id());

-- ── 2) Inscription : entreprise existante = invitation obligatoire ────────
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
  v_inv public.invitations%ROWTYPE;
BEGIN
  v_first_name := nullif(new.raw_user_meta_data ->> 'first_name', '');
  v_last_name  := nullif(new.raw_user_meta_data ->> 'last_name', '');
  v_company_name := nullif(new.raw_user_meta_data ->> 'company_name', '');

  IF v_company_name IS NOT NULL THEN
    -- Inscription publique (/inscription) : crée TOUJOURS une nouvelle
    -- entreprise. Impossible de se rattacher à une entreprise existante ici.
    INSERT INTO public.companies (name, trial_ends_at)
    VALUES (v_company_name, now() + interval '30 days')
    RETURNING id INTO v_company_id;
    v_role := 'admin'::public.battime_role;
    INSERT INTO public.worksites (company_id, client_name, city, is_active)
    VALUES (v_company_id, 'Autre', '', true);
  ELSE
    -- Pas de nom d'entreprise : seule une invitation en attente, posée par le
    -- bureau (fonction serveur invite-worker), donne le droit de rejoindre
    -- une entreprise. Les métadonnées company_id / role sont ignorées.
    SELECT i.* INTO v_inv
    FROM public.invitations i
    WHERE lower(i.email) = lower(new.email)
      AND i.accepted_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at > now())
    ORDER BY i.created_at DESC
    LIMIT 1;
    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: aucune invitation en attente pour % (et pas de nom d''entreprise)', new.email;
    END IF;
    v_company_id := v_inv.company_id;
    -- Un invité est toujours un salarié (étape 11 : rôle porté par l'invitation).
    v_role := 'worker'::public.battime_role;
    v_first_name := COALESCE(v_first_name, v_inv.first_name);
    v_last_name  := COALESCE(v_last_name, v_inv.last_name);
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

-- ── 3) accepted_at à la première connexion (+ rattrapage de l'existant) ───
CREATE OR REPLACE FUNCTION public.handle_first_sign_in()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF old.last_sign_in_at IS NULL AND new.last_sign_in_at IS NOT NULL THEN
    UPDATE public.invitations
    SET accepted_at = now()
    WHERE lower(email) = lower(new.email) AND accepted_at IS NULL;
  END IF;
  RETURN new;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.handle_first_sign_in() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_first_sign_in ON auth.users;
CREATE TRIGGER on_auth_user_first_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_first_sign_in();

UPDATE public.invitations i
SET accepted_at = now()
WHERE i.accepted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users a
    WHERE lower(a.email) = lower(i.email) AND a.last_sign_in_at IS NOT NULL
  );

-- ── 4) time_entries : policies cloisonnées ────────────────────────────────
DROP POLICY IF EXISTS time_entries_select_company_admin_or_own_worker ON public.time_entries;
CREATE POLICY time_entries_select_company_admin_or_own_worker ON public.time_entries
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));

DROP POLICY IF EXISTS time_entries_admin_all_mutations ON public.time_entries;
CREATE POLICY time_entries_admin_all_mutations ON public.time_entries
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());

DROP POLICY IF EXISTS time_entries_worker_insert ON public.time_entries;
CREATE POLICY time_entries_worker_insert ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_my_company_id() AND status = 'draft');

DROP POLICY IF EXISTS time_entries_worker_update ON public.time_entries;
CREATE POLICY time_entries_worker_update ON public.time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND company_id = public.get_my_company_id()
         AND status IN ('draft', 'submitted') AND locked = false)
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_my_company_id()
         AND status IN ('draft', 'submitted', 'cancelled') AND locked = false);

DROP POLICY IF EXISTS time_entries_worker_delete_own_draft ON public.time_entries;
CREATE POLICY time_entries_worker_delete_own_draft ON public.time_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND company_id = public.get_my_company_id()
         AND status = 'draft' AND locked = false);

-- ── 5) Cycle de vie protégé côté serveur ──────────────────────────────────
-- Pour un salarié : impossible de déplacer une ligne (jour, entreprise, auteur),
-- de toucher au verrou ou à l'export, et la trace « modifié après envoi » est
-- posée par le serveur, jamais par le téléphone.
CREATE OR REPLACE FUNCTION public.guard_time_entry_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN new;
  END IF;
  new.user_id      := old.user_id;
  new.company_id   := old.company_id;
  new.work_date    := old.work_date;
  new.locked       := old.locked;
  new.exported_at  := old.exported_at;
  new.validated_at := old.validated_at;
  new.validated_by := old.validated_by;

  IF old.status = 'submitted' AND (
       new.status = 'cancelled'
    OR (new.start_time, new.end_time, new.break_minutes, new.meal_allowance, new.observation, new.reception, new.worksite_id, new.photos)
       IS DISTINCT FROM
       (old.start_time, old.end_time, old.break_minutes, old.meal_allowance, old.observation, old.reception, old.worksite_id, old.photos)
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
  RETURN new;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.guard_time_entry_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS time_entries_guard_update ON public.time_entries;
CREATE TRIGGER time_entries_guard_update
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_update();

-- ── 6) planning / worksites / RPC ─────────────────────────────────────────
DROP POLICY IF EXISTS planning_worker_select_own ON public.planning;
CREATE POLICY planning_worker_select_own ON public.planning
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));

DROP POLICY IF EXISTS worksites_select_company ON public.worksites;
CREATE POLICY worksites_select_company ON public.worksites
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS worksites_worker_insert_own_company ON public.worksites;
CREATE POLICY worksites_worker_insert_own_company ON public.worksites
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE OR REPLACE FUNCTION public.ensure_planning_slot(p_user_id uuid, p_work_date date, p_worksite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
BEGIN
  IF p_worksite_id IS NULL THEN RETURN; END IF;
  v_company := public.get_my_company_id();
  IF v_company IS NULL THEN RETURN; END IF;
  -- Un salarié ne crée un créneau que pour lui-même ; le bureau pour son équipe.
  IF p_user_id <> auth.uid() AND NOT public.is_admin() THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND company_id = v_company) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.worksites WHERE id = p_worksite_id AND company_id = v_company) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.planning WHERE user_id = p_user_id AND work_date = p_work_date AND worksite_id = p_worksite_id) THEN RETURN; END IF;
  INSERT INTO public.planning (company_id, user_id, work_date, worksite_id, added_by_worker)
  VALUES (v_company, p_user_id, p_work_date, p_worksite_id, true);
END;
$function$;

-- Les autres RPC passent par get_my_company_id() : un compte archivé n'a
-- plus d'entreprise, donc plus de chantier « Autre », de demande d'absence,
-- d'abonnement push ni d'e-mail client à poser. Corps inchangés par ailleurs.
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
  v_company := public.get_my_company_id();
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

CREATE OR REPLACE FUNCTION public.request_leave(p_type text, p_start_date date, p_end_date date, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid; v_id uuid;
BEGIN
  IF p_type NOT IN ('conge', 'maladie', 'intemperie') THEN
    RAISE EXCEPTION 'Type de demande invalide';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La date de fin est avant le début';
  END IF;
  v_company := public.get_my_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'Profil introuvable'; END IF;

  INSERT INTO public.leave_requests (company_id, user_id, type, start_date, end_date, note)
  VALUES (v_company, auth.uid(), p_type, p_start_date, p_end_date, NULLIF(btrim(coalesce(p_note, '')), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid;
BEGIN
  IF coalesce(btrim(p_endpoint), '') = '' THEN RAISE EXCEPTION 'Endpoint manquant'; END IF;
  v_company := public.get_my_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'Profil introuvable'; END IF;

  INSERT INTO public.push_subscriptions (company_id, user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_company, auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_id = EXCLUDED.user_id, company_id = EXCLUDED.company_id,
        user_agent = EXCLUDED.user_agent;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_worksite_client_email(p_worksite_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.get_my_company_id();
  IF v_company IS NULL THEN RETURN; END IF;
  UPDATE public.worksites
     SET client_email = NULLIF(btrim(p_email), '')
   WHERE id = p_worksite_id AND company_id = v_company;
END;
$function$;

-- Les RPC ne sont pas appelables anonymement (le REVOKE ... FROM public ne
-- retirait pas le grant explicite posé à la création).
REVOKE EXECUTE ON FUNCTION public.ensure_other_worksite() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_planning_slot(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_leave(text, date, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_worksite_client_email(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_my_photo(text) FROM PUBLIC, anon;

-- ── 7) Données de paie : table à part, bureau uniquement ──────────────────
CREATE TABLE IF NOT EXISTS public.user_payroll (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  social_security_number text,
  hire_date date,
  contract_type text,
  hourly_rate numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_payroll_company_idx ON public.user_payroll (company_id);
ALTER TABLE public.user_payroll ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_payroll FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payroll TO authenticated;
GRANT ALL ON public.user_payroll TO service_role;
DROP POLICY IF EXISTS user_payroll_admin_all ON public.user_payroll;
CREATE POLICY user_payroll_admin_all ON public.user_payroll
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());

-- Reprise des valeurs déjà saisies (aucun NIR aujourd'hui, mais on migre proprement).
INSERT INTO public.user_payroll (user_id, company_id, social_security_number, hire_date, contract_type, hourly_rate)
SELECT id, company_id, social_security_number, hire_date, contract_type, hourly_rate
FROM public.users
WHERE social_security_number IS NOT NULL OR hire_date IS NOT NULL
   OR contract_type IS NOT NULL OR hourly_rate IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ── 8) APRÈS FUSION DU CODE — à exécuter séparément, une fois la PR fusionnée :
-- ALTER TABLE public.users
--   DROP COLUMN IF EXISTS social_security_number,
--   DROP COLUMN IF EXISTS hire_date,
--   DROP COLUMN IF EXISTS contract_type,
--   DROP COLUMN IF EXISTS hourly_rate;
