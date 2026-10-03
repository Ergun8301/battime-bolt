-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 11 — « CLÔTURER JUSQU'AU… » : FIN DE CONTRAT EN COURS DE MOIS
-- ═════════════════════════════════════════════════════════════════════════════
-- NON appliquée : feu vert d'Ergun. Testée sur un Postgres jetable :
--   npm run test:cloture-salarie   (supabase/tests/lot11_cloture_salarie.mjs)
--
-- 100 % ADDITIVE. Une table neuve (user_closures), une fonction de lecture
-- neuve, trois fonctions de trigger neuves, trois triggers neufs. Aucune table,
-- colonne, policy ou fonction existante n'est modifiée : la clôture du mois
-- (month_closures, is_month_closed, guard_time_entry_write/_delete,
-- guard_active_session, guard_month_closure) et finish_active_session restent
-- mot pour mot. Aucune donnée n'est touchée.
--
-- LA RÈGLE, calquée sur la clôture du mois :
--   · le bureau clôture les heures D'UN salarié jusqu'à une date (incluse) ;
--   · ce salarié (et un chef d'équipe pour lui) ne peut plus rien insérer,
--     modifier ni effacer sur ces jours, ni y démarrer un pointage ;
--   · le bureau garde la main (correction, rouvrir) ; le cron/service_role
--     (auth.uid() nul) n'est pas concerné ;
--   · « corrigé sur place » (mark_reserve_fixed, drapeau
--     bemexo.allow_reserve_fix — aussi posé par la levée de réserve du
--     salarié) reste permis, comme sur un mois clos ;
--   · pas de clôture dans le futur (le salarié ne pourrait plus saisir ses
--     derniers jours) ni pendant un pointage ouvert sur un jour clos (il ne
--     pourrait plus le fermer) ;
--   · « Rouvrir » NE SUPPRIME RIEN : il pose reopened_at (et reopened_by).
--     Une ligne rouverte n'a plus aucun effet. Aucune policy DELETE.
--
-- Messages : contiennent « clôturé » (« clôturées ») et « jusqu'au » → la borne
-- (kiosk, /clôturé/i → month_closed) refuse proprement (409) ; SQLSTATE P0001
-- → la file hors ligne arrête de réessayer.
--
-- ⚠ ÉCRAN DU SALARIÉ : le correctif poseur-day fait partie du MÊME lot (11).
-- Il lit fetchMyClosure (lib/worker-closure.ts), verrouille seulement les
-- jours <= la date de clôture (pas tout le mois) et teste « jusqu'au » AVANT
-- « clôturé ». Une clôture ne peut être créée que depuis le nouvel écran du
-- bureau (« Clôturer jusqu'au… ») : appliquer la migration avant la mise en
-- ligne de l'application ne change rien tant que personne ne clôture. Ne pas
-- clôturer un VRAI salarié depuis une préview avant que bemexo.com ait le
-- lot 11 (l'ancien écran du salarié lirait le refus comme « mois clôturé »).
-- La borne affiche « Heures clôturées par le bureau. » une fois `kiosk`
-- redéployée (avant : « Ce mois est clôturé par le bureau. », refus juste).
--
-- Tant que cette migration n'est pas appliquée, l'écran du bureau masque
-- « Clôturer jusqu'au… » (lecture de la table en échec) : rien ne casse.

-- ── 1) La table : une ligne par salarié (la nouvelle date remplace l'ancienne)
CREATE TABLE IF NOT EXISTS public.user_closures (
  user_id      uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  closed_until date NOT NULL,
  closed_at    timestamptz NOT NULL DEFAULT now(),
  closed_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reopened_at  timestamptz NULL,
  reopened_by  uuid NULL REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS user_closures_company_idx ON public.user_closures (company_id);
COMMENT ON TABLE public.user_closures IS
  'Heures d''un salarié closes par le bureau jusqu''à closed_until inclus (fin de contrat en cours de mois). Active tant que reopened_at est nul. Le salarié ne peut plus rien écrire sur ces jours ; le bureau, si. « Rouvrir » pose reopened_at, rien n''est supprimé.';

ALTER TABLE public.user_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_closures FROM anon;
REVOKE ALL ON public.user_closures FROM authenticated;
-- Pas de DELETE pour authenticated : « Rouvrir » n'efface pas, il date.
GRANT SELECT, INSERT, UPDATE ON public.user_closures TO authenticated;
GRANT ALL ON public.user_closures TO service_role;

-- Le bureau lit tout ; le salarié lit SA ligne (pour savoir pourquoi c'est
-- fermé) — jamais la date de fin d'un collègue.
DROP POLICY IF EXISTS user_closures_select ON public.user_closures;
CREATE POLICY user_closures_select ON public.user_closures
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));

-- Clôturer : le bureau, pour un salarié de SON entreprise, en son propre nom.
DROP POLICY IF EXISTS user_closures_admin_insert ON public.user_closures;
CREATE POLICY user_closures_admin_insert ON public.user_closures
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id() AND public.is_admin()
    AND (closed_by IS NULL OR closed_by = auth.uid())
    AND EXISTS (SELECT 1 FROM public.users u
                WHERE u.id = user_closures.user_id AND u.company_id = user_closures.company_id)
  );

-- Déplacer la date / rouvrir : le bureau. closed_by peut rester celui d'un
-- collègue du bureau (rouvrir la clôture posée par un autre admin) ; le
-- trigger user_closures_guard interdit de le CHANGER pour quelqu'un d'autre
-- que soi.
DROP POLICY IF EXISTS user_closures_admin_update ON public.user_closures;
CREATE POLICY user_closures_admin_update ON public.user_closures
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (
    company_id = public.get_my_company_id() AND public.is_admin()
    AND EXISTS (SELECT 1 FROM public.users u
                WHERE u.id = user_closures.user_id AND u.company_id = user_closures.company_id)
    AND (closed_by IS NULL OR closed_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.users b
                    WHERE b.id = user_closures.closed_by AND b.company_id = user_closures.company_id))
  );

-- Support (lot 5) : la même lecture seule que sur month_closures.
DO $do$
BEGIN
  IF to_regprocedure('public.support_company_ids()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS support_read ON public.user_closures';
    EXECUTE 'CREATE POLICY support_read ON public.user_closures FOR SELECT TO authenticated '
            'USING (company_id = ANY ((SELECT public.support_company_ids())::uuid[]))';
  END IF;
END
$do$;

-- ── 2) Lecture interne (pas exposée : elle contourne la RLS) ───────────────
-- La date de clôture ACTIVE du salarié (NULL si aucune, ou rouverte).
CREATE OR REPLACE FUNCTION public.user_closed_until(p_user uuid)
 RETURNS date
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  SELECT c.closed_until FROM public.user_closures c
   WHERE c.user_id = p_user AND c.reopened_at IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.user_closed_until(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3) Heures : insert / update / delete refusés sur un jour clos ──────────
-- Trigger NEUF, à côté de time_entries_guard_write et _guard_delete
-- (inchangés). Il passe AVANT time_entries_guard_write (ordre alphabétique :
-- …_user_closure < …_write) : sur un UPDATE, la date et le salarié n'ont pas
-- encore été remis à l'ancienne valeur → on vérifie l'ancienne ET la nouvelle
-- ligne (déplacer une ligne VERS un jour clos est donc refusé aussi).
CREATE OR REPLACE FUNCTION public.guard_time_entry_user_closure()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_until date;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND current_setting('bemexo.allow_reserve_fix', true) IS DISTINCT FROM '1' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_until := public.user_closed_until(old.user_id);
      IF v_until IS NOT NULL AND old.work_date <= v_until THEN
        RAISE EXCEPTION 'time_entries: heures clôturées par le bureau jusqu''au %', to_char(v_until, 'DD/MM/YYYY');
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_until := public.user_closed_until(new.user_id);
      IF v_until IS NOT NULL AND new.work_date <= v_until THEN
        RAISE EXCEPTION 'time_entries: heures clôturées par le bureau jusqu''au %', to_char(v_until, 'DD/MM/YYYY');
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN old;
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_time_entry_user_closure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_entries_guard_user_closure ON public.time_entries;
CREATE TRIGGER time_entries_guard_user_closure
  BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_user_closure();

-- ── 4) Pointage : pas de chrono sur un jour clos (borne comprise) ──────────
-- La borne insère au nom du salarié : elle est couverte. finish_active_session
-- n'est pas concerné (il efface le chrono, il n'en crée pas).
CREATE OR REPLACE FUNCTION public.guard_active_session_user_closure()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_until date;
BEGIN
  v_until := public.user_closed_until(new.user_id);
  IF v_until IS NOT NULL AND new.work_date <= v_until THEN
    RAISE EXCEPTION 'active_sessions: heures clôturées par le bureau jusqu''au %', to_char(v_until, 'DD/MM/YYYY');
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_active_session_user_closure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS active_sessions_guard_user_closure ON public.active_sessions;
CREATE TRIGGER active_sessions_guard_user_closure
  BEFORE INSERT OR UPDATE OF work_date, user_id ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_session_user_closure();

-- ── 5) La clôture elle-même ────────────────────────────────────────────────
--   · pas dans le futur, pas sur un pointage ouvert (comme guard_month_closure) ;
--   · closed_by ne devient jamais quelqu'un d'autre que celui qui agit ;
--   · « Rouvrir » (reopened_at posé) : reopened_by = celui qui agit, et aucune
--     des deux vérifications ci-dessus (rouvrir doit toujours être possible).
CREATE OR REPLACE FUNCTION public.guard_user_closure()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_qui text;
BEGIN
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL
     AND new.closed_by IS DISTINCT FROM old.closed_by
     AND new.closed_by IS NOT NULL AND new.closed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_closures: closed_by = celui qui clôture';
  END IF;

  IF new.reopened_at IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR old.reopened_at IS NULL THEN
      new.reopened_by := auth.uid();
    ELSE
      new.reopened_by := old.reopened_by;
    END IF;
    RETURN new;
  END IF;
  new.reopened_by := NULL;

  IF new.closed_until > (now() AT TIME ZONE 'Europe/Paris')::date THEN
    RAISE EXCEPTION 'Impossible de clôturer après aujourd''hui : le salarié ne pourrait plus saisir ses derniers jours.';
  END IF;
  SELECT btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
    INTO v_qui
    FROM public.active_sessions a
    JOIN public.users u ON u.id = a.user_id
   WHERE a.user_id = new.user_id AND a.work_date <= new.closed_until;
  IF FOUND THEN
    RAISE EXCEPTION 'Impossible de clôturer : % a un pointage encore ouvert. Sa journée doit être fermée avant.',
      coalesce(nullif(v_qui, ''), 'ce salarié');
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_user_closure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_closures_guard ON public.user_closures;
CREATE TRIGGER user_closures_guard
  BEFORE INSERT OR UPDATE ON public.user_closures
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_closure();

-- ── Contrôle (après application) ───────────────────────────────────────────
-- SELECT
--   to_regclass('public.user_closures') AS table_cloture_salarie,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='user_closures') AS policies,   -- 4
--   (SELECT count(*) FROM pg_trigger WHERE tgname IN
--      ('time_entries_guard_user_closure','active_sessions_guard_user_closure','user_closures_guard')) AS triggers_neufs,  -- 3
--   (SELECT count(*) FROM pg_trigger WHERE tgname IN
--      ('time_entries_guard_write','time_entries_guard_delete','active_sessions_guard','month_closures_guard')) AS triggers_existants;  -- 4
