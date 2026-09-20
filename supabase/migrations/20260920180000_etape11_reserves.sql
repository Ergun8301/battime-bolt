-- 2026-09-20 — Étape 11 : le registre des réserves.
--
-- CE QUI EXISTE DÉJÀ : le salarié déclare, sur son intervention, si le chantier
-- est en cours, réceptionné sans réserve, ou AVEC réserve (colonne `reception`,
-- détail dans `observation`, photos dans le module Documents).
--
-- CE QUI MANQUAIT : une fois la journée passée, la réserve disparaissait de
-- l'écran. Le bureau ne la revoyait qu'en rouvrant la bonne case du bon jour.
-- Une réserve déclarée il y a trois semaines n'existait plus pour personne, et
-- rien ne permettait de dire « c'est traité ».
--
-- CE QUE CETTE ÉTAPE AJOUTE : une réserve se LÈVE. On garde la trace de qui l'a
-- levée, quand, et ce qui a été fait. Rien n'est effacé : une réserve levée
-- reste consultable, avec sa date de déclaration d'origine.
--
-- La levée ne touche AUCUNE colonne de paie. Une réserve peut donc être levée
-- sur un mois déjà exporté ou clôturé — un chantier ne s'arrête pas parce que
-- la paie est partie. C'est voulu.
--
-- À exécuter AVANT de fusionner la PR.

-- ── 1) Les colonnes de la levée ───────────────────────────────────────────
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS reserve_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserve_resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserve_resolution text;

COMMENT ON COLUMN public.time_entries.reserve_resolved_at IS
  'Date de levée de la réserve. NULL = réserve encore à traiter.';
COMMENT ON COLUMN public.time_entries.reserve_resolution IS
  'Ce qui a été fait pour lever la réserve, écrit par le bureau.';

-- Le registre ne lit que les interventions AVEC réserve : sans cet index, il
-- balaie toute la table de pointage de l'entreprise à chaque ouverture.
CREATE INDEX IF NOT EXISTS time_entries_reserves_open_idx
  ON public.time_entries (company_id, worksite_id, work_date DESC)
  WHERE reception = 'avec';

-- ── 2) La levée est une décision du bureau ────────────────────────────────
-- Le garde recopie les trois colonnes pour un NON-admin : sans ça, un salarié
-- pourrait lever lui-même la réserve que le client a émise sur son travail.
-- (Définition reprise telle quelle de la production, + les trois lignes.)
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
    -- Une réserve naît toujours à traiter.
    new.reserve_resolved_at := NULL;
    new.reserve_resolved_by := NULL;
    new.reserve_resolution  := NULL;
  ELSE
    new.user_id      := old.user_id;
    new.company_id   := old.company_id;
    new.work_date    := old.work_date;
    new.locked       := old.locked;
    new.exported_at  := old.exported_at;
    new.validated_at := old.validated_at;
    new.validated_by := old.validated_by;
    new.client_id    := old.client_id;
    -- Lever une réserve n'appartient pas au salarié.
    new.reserve_resolved_at := old.reserve_resolved_at;
    new.reserve_resolved_by := old.reserve_resolved_by;
    new.reserve_resolution  := old.reserve_resolution;

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

  IF new.worksite_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.worksites w
       WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'time_entries: chantier hors de votre entreprise';
  END IF;
  RETURN new;
END;
$function$;

-- ── 3) Lever / rouvrir une réserve ────────────────────────────────────────
-- Passe par une fonction serveur plutôt qu'un UPDATE direct : l'auteur de la
-- levée est pris dans la session, jamais dans la requête, et une réserve qui
-- n'existe pas (ou qui appartient à une autre entreprise) le dit clairement au
-- lieu de renvoyer « 0 ligne modifiée » sans erreur.
CREATE OR REPLACE FUNCTION public.set_reserve_resolution(
  p_entry_id uuid,
  p_resolved boolean,
  p_note text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_reception text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''entreprise';
  END IF;

  SELECT t.company_id, t.reception INTO v_company, v_reception
  FROM public.time_entries t
  WHERE t.id = p_entry_id AND t.company_id = public.get_my_company_id();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Réserve introuvable';
  END IF;
  IF v_reception IS DISTINCT FROM 'avec' THEN
    RAISE EXCEPTION 'Cette intervention ne porte pas de réserve';
  END IF;

  UPDATE public.time_entries SET
    reserve_resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END,
    reserve_resolved_by = CASE WHEN p_resolved THEN auth.uid() ELSE NULL END,
    -- Rouvrir efface le compte rendu : il décrirait une levée qui n'a plus lieu.
    reserve_resolution  = CASE WHEN p_resolved THEN nullif(btrim(p_note), '') ELSE NULL END
  WHERE id = p_entry_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.set_reserve_resolution(uuid, boolean, text) FROM PUBLIC, anon;
-- Droit rendu EXPLICITE au rôle connecté. Supabase l'accorde déjà par défaut à
-- la création (`authenticated=X` dans l'ACL, vérifié en production), mais ce
-- fichier ne doit pas dépendre d'un réglage d'environnement : rejoué sur un
-- projet configuré autrement, le retrait à PUBLIC suffirait à rendre le bouton
-- « Lever la réserve » inutilisable, avec une erreur de permission.
GRANT EXECUTE ON FUNCTION public.set_reserve_resolution(uuid, boolean, text) TO authenticated;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='time_entries'
--       AND column_name IN ('reserve_resolved_at','reserve_resolved_by','reserve_resolution')) AS colonnes,
--   (SELECT count(*) FROM pg_indexes
--     WHERE schemaname='public' AND indexname='time_entries_reserves_open_idx') AS index_reserves,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='set_reserve_resolution') AS rpc_levee;
