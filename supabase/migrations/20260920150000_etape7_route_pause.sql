-- 2026-09-20 — Étape 7 : le temps entre deux chantiers est nommé, jamais deviné.
--
-- Aujourd'hui le trou entre deux interventions est calculé et appelé « pause »,
-- sans que personne ne l'ait dit. Or entre deux chantiers, ce temps est souvent
-- de la route — du travail. L'appeler pause revient à déduire des heures en
-- silence ; l'appeler route reviendrait à en payer sans le dire. Dans les deux
-- cas c'est le logiciel qui tranche à la place de l'entreprise.
--
-- Désormais : le salarié dit lui-même « Route » ou « Pause » pour chaque trou,
-- et l'entreprise décide une fois pour toutes si la route est payée.
--
-- À exécuter AVANT de fusionner la PR.

-- ── 1) Le trou qui précède une intervention, qualifié par le salarié ──────
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS gap_before text
  CONSTRAINT time_entries_gap_before_check CHECK (gap_before IN ('route', 'pause'));

COMMENT ON COLUMN public.time_entries.gap_before IS
  'Nature du temps écoulé depuis l''intervention précédente du même jour, dit par le salarié : route (trajet entre chantiers) ou pause. NULL tant que la question n''a pas été posée.';

-- ── 2) Le réglage entreprise : la route est-elle payée ? ──────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS travel_paid boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.travel_paid IS
  'Le temps de route entre deux chantiers est-il payé ? Décision de l''entreprise, jamais du logiciel.';

-- Le réglage rejoint les autres champs humains. L'ancienne signature est
-- remplacée : un appel qui n'envoie pas le nouveau paramètre continue de
-- fonctionner (valeur par défaut NULL = on ne touche pas au réglage), donc
-- l'application déjà en ligne n'est pas cassée pendant la bascule.
DROP FUNCTION IF EXISTS public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean);

CREATE OR REPLACE FUNCTION public.update_company_info(
  p_name text, p_siret text, p_tva_intra text, p_address text, p_postal_code text,
  p_city text, p_phone text, p_email text, p_logo_url text,
  p_auto_reminder_enabled boolean DEFAULT NULL,
  p_reminder_hour smallint DEFAULT NULL,
  p_budget_alerts_enabled boolean DEFAULT NULL,
  p_travel_paid boolean DEFAULT NULL
)
 RETURNS void
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

  IF p_reminder_hour IS NOT NULL AND (p_reminder_hour < 0 OR p_reminder_hour > 23) THEN
    RAISE EXCEPTION 'Heure de relance invalide';
  END IF;

  UPDATE public.companies SET
    name        = COALESCE(nullif(btrim(p_name), ''), name),
    siret       = nullif(btrim(p_siret), ''),
    tva_intra   = nullif(btrim(p_tva_intra), ''),
    address     = nullif(btrim(p_address), ''),
    postal_code = nullif(btrim(p_postal_code), ''),
    city        = nullif(btrim(p_city), ''),
    phone       = nullif(btrim(p_phone), ''),
    email       = nullif(btrim(p_email), ''),
    logo_url    = nullif(btrim(p_logo_url), ''),
    auto_reminder_enabled = COALESCE(p_auto_reminder_enabled, auto_reminder_enabled),
    reminder_hour         = COALESCE(p_reminder_hour, reminder_hour),
    budget_alerts_enabled = COALESCE(p_budget_alerts_enabled, budget_alerts_enabled),
    travel_paid           = COALESCE(p_travel_paid, travel_paid)
  WHERE id = v_company;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.update_company_info(text, text, text, text, text, text, text, text, text, boolean, smallint, boolean, boolean) FROM PUBLIC, anon;

-- ── 3) Le garde-fou suit la nouvelle colonne ─────────────────────────────
-- Requalifier un trou après l'envoi change les heures payées : ça doit laisser
-- la même trace que changer un horaire.
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
      OR (new.start_time, new.end_time, new.break_minutes, new.meal_allowance, new.observation, new.reception, new.worksite_id, new.photos, new.gap_before)
         IS DISTINCT FROM
         (old.start_time, old.end_time, old.break_minutes, old.meal_allowance, old.observation, old.reception, old.worksite_id, old.photos, old.gap_before)
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

-- ── 4) Contrôle ──────────────────────────────────────────────────────────
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='time_entries' AND column_name='gap_before') AS colonne_trajet,
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='companies' AND column_name='travel_paid') AS reglage_entreprise,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='update_company_info') AS rpc_reglages;
