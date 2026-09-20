-- 2026-09-20 — Étape 17 : le salarié peut dire « corrigé sur place ».
--
-- CE QUI MANQUAIT. Le salarié qui retourne sur le chantier et règle le problème
-- n'avait aucun moyen de le signaler : il fallait qu'il appelle le bureau, qui
-- lève la réserve sur parole. Entre les deux, la réserve reste rouge dans le
-- registre alors que le travail est fait.
--
-- CE QUI NE CHANGE PAS. La levée définitive reste au bureau. Un salarié ne
-- clôt pas la réserve émise sur son propre travail — ce serait se donner
-- quitus. Il DÉCLARE avoir corrigé ; le bureau constate et lève.
--
-- Deux gestes distincts, deux traces distinctes :
--   `reserve_fixed_*`    — le salarié dit avoir corrigé (il peut se rétracter
--                          tant que le bureau n'a pas levé).
--   `reserve_resolved_*` — le bureau lève. Inchangé, admin seul.
--
-- À exécuter AVANT de fusionner la PR.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS reserve_fixed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserve_fixed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserve_fix_note text;

COMMENT ON COLUMN public.time_entries.reserve_fixed_at IS
  'Le salarié déclare avoir corrigé sur place. NE LÈVE PAS la réserve : seul le bureau le fait.';

-- ── Le garde : le salarié ne touche toujours pas à la levée ───────────────
-- Il peut en revanche poser sa propre déclaration, sur SA ligne. La RLS
-- restreint déjà l'UPDATE d'un salarié à ses propres lignes ; ici on s'assure
-- qu'il ne se sert pas de ce droit pour lever la réserve.
--
-- (Définition reprise de la production, seule la partie « réserve » change.)
CREATE OR REPLACE FUNCTION public.guard_time_entry_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN new;
  END IF;

  -- Un mois clôturé fige la PAIE, pas le chantier. Déclarer « corrigé sur
  -- place » ne touche aucune colonne d'heures — c'est le pendant de la levée
  -- par le bureau, qu'on autorise déjà sur un mois clos depuis l'étape 11. Sans
  -- cette exception, le bouton s'affichait et échouait sur un message de paie
  -- qui n'a rien à voir avec le geste.
  IF public.is_month_closed(new.company_id, new.work_date)
     AND current_setting('bemexo.allow_reserve_fix', true) IS DISTINCT FROM '1' THEN
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
    new.reserve_resolved_at := NULL;
    new.reserve_resolved_by := NULL;
    new.reserve_resolution  := NULL;
    -- Une réserve naît non corrigée : la déclaration se fait après coup.
    new.reserve_fixed_at := NULL;
    new.reserve_fixed_by := NULL;
    new.reserve_fix_note := NULL;
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
    -- Et il ne se déclare pas « corrigé » par un UPDATE direct : ça passe par
    -- `mark_reserve_fixed`, qui vérifie qu'il s'agit bien d'une réserve encore
    -- ouverte et qui horodate côté serveur.
    --
    -- L'exception, c'est justement cette fonction-là. Sans elle, le garde
    -- recopiait l'ancienne valeur par-dessus l'écriture de la RPC : le salarié
    -- appuyait, aucune erreur ne remontait, et rien n'était enregistré. Le
    -- marqueur est posé par la fonction elle-même, pour la durée de la
    -- transaction seulement ; un client ne peut pas le poser.
    IF current_setting('bemexo.allow_reserve_fix', true) IS DISTINCT FROM '1' THEN
      new.reserve_fixed_at := old.reserve_fixed_at;
      new.reserve_fixed_by := old.reserve_fixed_by;
      new.reserve_fix_note := old.reserve_fix_note;
    END IF;

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
$fn$;

-- ── Déclarer « corrigé sur place » ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_reserve_fixed(
  p_entry_id uuid,
  p_fixed boolean,
  p_note text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_owner uuid;
  v_company uuid;
  v_reception text;
  v_resolved timestamptz;
  v_touched int;
BEGIN
  SELECT t.user_id, t.company_id, t.reception, t.reserve_resolved_at
    INTO v_owner, v_company, v_reception, v_resolved
  FROM public.time_entries t
  WHERE t.id = p_entry_id AND t.company_id = public.get_my_company_id();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Intervention introuvable';
  END IF;
  -- Le bureau n'a pas besoin de ce geste : il lève directement.
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le salarié concerné peut déclarer avoir corrigé';
  END IF;
  IF v_reception IS DISTINCT FROM 'avec' THEN
    RAISE EXCEPTION 'Cette intervention ne porte pas de réserve';
  END IF;
  -- Une fois le bureau passé, le geste n'a plus d'objet — et le permettre
  -- laisserait croire au salarié qu'il peut rouvrir ce qui est clos.
  IF v_resolved IS NOT NULL THEN
    RAISE EXCEPTION 'Cette réserve a déjà été levée par le bureau';
  END IF;

  -- Laisse passer l'écriture ci-dessous, ET ELLE SEULE. Le laissez-passer est
  -- refermé juste après : `set_config(..., true)` porte sur la TRANSACTION, pas
  -- sur l'instruction. Laissé ouvert, il autoriserait n'importe quelle écriture
  -- suivante de la même transaction à forger ces colonnes — ce que le test a
  -- effectivement réussi à faire avant cette correction.
  PERFORM set_config('bemexo.allow_reserve_fix', '1', true);

  -- La condition est RÉPÉTÉE dans le WHERE, pas seulement vérifiée plus haut :
  -- entre le SELECT et l'UPDATE, le bureau peut avoir levé la réserve. Sans
  -- elle, la déclaration se poserait sur une réserve déjà close. On vérifie
  -- ensuite qu'une ligne a bougé — sinon c'est exactement ce qui vient de se
  -- produire, et il faut le dire plutôt que de laisser croire au salarié que
  -- son geste est enregistré.
  UPDATE public.time_entries SET
    reserve_fixed_at = CASE WHEN p_fixed THEN now() ELSE NULL END,
    reserve_fixed_by = CASE WHEN p_fixed THEN auth.uid() ELSE NULL END,
    reserve_fix_note = CASE WHEN p_fixed THEN nullif(btrim(p_note), '') ELSE NULL END
  WHERE id = p_entry_id AND reserve_resolved_at IS NULL;

  GET DIAGNOSTICS v_touched = ROW_COUNT;
  PERFORM set_config('bemexo.allow_reserve_fix', '0', true);

  IF v_touched = 0 THEN
    RAISE EXCEPTION 'Cette réserve vient d''être levée par le bureau';
  END IF;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.mark_reserve_fixed(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_reserve_fixed(uuid, boolean, text) TO authenticated;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='time_entries' AND column_name LIKE 'reserve_fix%') AS colonnes,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='mark_reserve_fixed') AS rpc;
