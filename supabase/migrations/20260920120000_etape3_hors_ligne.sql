-- 2026-09-20 — Étape 3 : hors-ligne fiable.
--
-- Une saisie faite sans réseau peut être envoyée plusieurs fois : le téléphone
-- n'a aucun moyen de savoir si la réponse perdue signifiait « enregistré » ou
-- « échec ». On lui donne un identifiant local, et la base refuse le doublon.
--
-- À exécuter AVANT de fusionner la PR. L'application sait fonctionner sans
-- (elle réessaie sans identifiant), mais la protection contre les doublons
-- n'existe qu'une fois ce bloc passé.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS client_id text;

COMMENT ON COLUMN public.time_entries.client_id IS
  'Identifiant produit par le téléphone pour une saisie hors-ligne. Unique par salarié : empêche la même saisie d''entrer deux fois quand la réponse du serveur se perd.';

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_client_id_unique
  ON public.time_entries (user_id, client_id)
  WHERE client_id IS NOT NULL;

-- Le salarié pose son identifiant à l'insertion ; ensuite il est figé, comme le
-- reste du cycle de vie (étape 2).
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

-- Contrôle : la colonne, l'index et le trigger sont en place.
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='time_entries' AND column_name='client_id') AS colonne,
--   (SELECT count(*) FROM pg_indexes
--     WHERE schemaname='public' AND indexname='time_entries_client_id_unique') AS index_unique,
--   (SELECT count(*) FROM pg_trigger WHERE tgname='time_entries_guard_write') AS trigger_garde;
