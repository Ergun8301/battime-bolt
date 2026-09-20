-- 2026-09-20 — Étape 6 : la clôture du mois devient une vraie décision du bureau.
--
-- Jusqu'ici l'application affichait « Mois clôturé » dès qu'un jour appartenait
-- à un mois passé. C'était une devinette du téléphone : personne n'avait rien
-- clôturé, et la base ne refusait rien. Un salarié pouvait écrire dans un mois
-- déjà exporté par l'API, et le bureau n'avait aucun moyen de dire « c'est
-- bouclé, la paie est partie ».
--
-- Désormais : le bureau clôture explicitement un mois, la base refuse toute
-- écriture d'un salarié sur ce mois, et le bureau peut rouvrir s'il s'est
-- trompé. Le bureau, lui, garde la main : la clôture protège la paie des
-- modifications du terrain, elle n'empêche pas une correction décidée au
-- bureau.
--
-- À exécuter AVANT de fusionner la PR.

-- ── 1) Les mois clôturés ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.month_closures (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  month date NOT NULL,                 -- toujours le 1er du mois
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, month),
  CONSTRAINT month_closures_first_day CHECK (month = date_trunc('month', month)::date)
);

COMMENT ON TABLE public.month_closures IS
  'Mois déclarés clos par le bureau. Un salarié ne peut plus rien écrire sur un mois présent ici.';

ALTER TABLE public.month_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.month_closures FROM anon;
GRANT SELECT, INSERT, DELETE ON public.month_closures TO authenticated;
GRANT ALL ON public.month_closures TO service_role;

-- Tout le monde dans l'entreprise LIT : le salarié doit savoir pourquoi c'est
-- fermé, plutôt que de se heurter à un refus sans explication.
DROP POLICY IF EXISTS month_closures_select_company ON public.month_closures;
CREATE POLICY month_closures_select_company ON public.month_closures
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

-- Seul le bureau clôture et rouvre.
DROP POLICY IF EXISTS month_closures_admin_write ON public.month_closures;
CREATE POLICY month_closures_admin_write ON public.month_closures
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (
    company_id = public.get_my_company_id() AND public.is_admin()
    -- L'auteur enregistré est bien celui qui agit.
    AND (closed_by IS NULL OR closed_by = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.is_month_closed(p_company uuid, p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.month_closures m
    WHERE m.company_id = p_company
      AND m.month = date_trunc('month', p_date)::date
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_month_closed(uuid, date) FROM PUBLIC, anon;

-- ── 2) Le garde-fou refuse les écritures du terrain sur un mois clos ───────
CREATE OR REPLACE FUNCTION public.guard_time_entry_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN new;
  END IF;

  -- Mois clôturé par le bureau : plus rien ne bouge depuis le terrain.
  IF public.is_month_closed(new.company_id, new.work_date) THEN
    RAISE EXCEPTION 'time_entries: le mois est clôturé par le bureau';
  END IF;

  IF TG_OP = 'INSERT' THEN
    new.locked       := false;
    new.exported_at  := NULL;
    new.validated_at := NULL;
    new.validated_by := NULL;
    new.modified_at  := NULL;
    new.modified_by  := NULL;
    new.submitted_at := NULL;
  ELSE
    new.user_id      := old.user_id;
    new.company_id   := old.company_id;
    new.work_date    := old.work_date;
    new.locked       := old.locked;
    new.exported_at  := old.exported_at;
    new.validated_at := old.validated_at;
    new.validated_by := old.validated_by;
    new.client_id    := old.client_id;

    -- Transitions permises : brouillon → envoyé / retiré ; envoyé → retiré.
    IF old.status = 'submitted' AND new.status = 'draft' THEN
      RAISE EXCEPTION 'time_entries: une journée envoyée ne redevient pas brouillon (retirez-la ou corrigez-la)';
    END IF;
    IF old.status = 'cancelled' AND new.status <> 'cancelled' THEN
      RAISE EXCEPTION 'time_entries: une intervention retirée ne se réactive pas';
    END IF;

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
  END IF;

  -- Le chantier pointé appartient forcément à l'entreprise de la ligne.
  IF new.worksite_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.worksites w
       WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'time_entries: chantier hors de votre entreprise';
  END IF;
  RETURN new;
END;
$function$;

-- La suppression ne passe pas par le garde-fou ci-dessus (il ne voit que les
-- insertions et les modifications) : sans ça, un salarié pouvait encore
-- effacer un brouillon d'un mois clos.
CREATE OR REPLACE FUNCTION public.guard_time_entry_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN old;
  END IF;
  IF public.is_month_closed(old.company_id, old.work_date) THEN
    RAISE EXCEPTION 'time_entries: le mois est clôturé par le bureau';
  END IF;
  RETURN old;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.guard_time_entry_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS time_entries_guard_delete ON public.time_entries;
CREATE TRIGGER time_entries_guard_delete
  BEFORE DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_delete();

-- ── 3) Contrôle ────────────────────────────────────────────────────────────
-- SELECT
--   (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='month_closures') AS table_cloture,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='month_closures') AS policies,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname IN ('is_month_closed','guard_time_entry_delete')) AS fonctions,
--   (SELECT count(*) FROM pg_trigger WHERE tgname IN ('time_entries_guard_write','time_entries_guard_delete')) AS triggers;
