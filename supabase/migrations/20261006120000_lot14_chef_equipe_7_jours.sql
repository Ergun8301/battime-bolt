-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 14 — CHEF D'ÉQUIPE : TOUTE L'ÉQUIPE, SUR LES 7 DERNIERS JOURS
-- ═════════════════════════════════════════════════════════════════════════════
-- NON appliquée : feu vert d'Ergun (part avec les lots 11, 12, 13). Testée sur
-- un Postgres jetable : npm run test:chef-equipe (supabase/tests/lot14_chef_equipe.mjs).
--
-- POURQUOI. Le chef ne pouvait saisir que les salariés présents sur SON
-- chantier, le jour même. Sur le terrain, il n'est pas toujours sur place et il
-- remplit souvent le lendemain.
--
-- LA NOUVELLE RÈGLE (demande d'Ergun) :
--   · le chef saisit et corrige les heures de TOUS les salariés actifs de son
--     entreprise (rôle Salarié ou Chef d'équipe), sur les 7 derniers jours,
--     aujourd'hui compris (Europe/Paris) ;
--   · jamais un compte Bureau ; jamais une ligne validée ou verrouillée (les
--     policies existantes ne laissent passer que draft / submitted non
--     verrouillé) ; jamais un mois clôturé ni un salarié clôturé (gardes
--     existants, inchangés) ; il n'ENVOIE jamais à la place du salarié (garde
--     existant : une ligne d'un autre reste en brouillon) ;
--   · déjà une ligne ce jour-là sur ce chantier → il la corrige, il n'en crée
--     pas une deuxième (refus en base) ;
--   · chaque ligne saisie ou corrigée par lui garde la trace
--     « par le chef d'équipe » (lead_edited_by / lead_edited_at), posée par la
--     base, visible du bureau. Personne ne peut l'effacer ni la poser à la main.
--   · les salariés ne changent rien : leurs policies et leurs gardes sont
--     intactes.
--
-- CE QUI EST TOUCHÉ :
--   · `is_my_team_member(uuid, date)` reçoit sa NOUVELLE VERSION (demandé :
--     « nouvelle version de is_my_team_member ») — même signature, même
--     sécurité (SECURITY DEFINER, search_path vide). Toutes les policies et
--     `correct_time_entry` qui l'appellent suivent la nouvelle règle sans être
--     modifiées. L'ancienne version est recopiée en bas (retour arrière).
--   · ADDITIF pour le reste : 2 colonnes neuves (valeur par défaut NULL), 1
--     fonction de trigger neuve, 1 trigger neuf. Aucune policy modifiée, aucune
--     donnée touchée.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Trace « par le chef d'équipe » ───────────────────────────────────────
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS lead_edited_by uuid DEFAULT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_edited_at timestamptz DEFAULT NULL;
COMMENT ON COLUMN public.time_entries.lead_edited_by IS
  'Lot 14 : dernier chef d''équipe qui a saisi ou corrigé cette ligne (pour un autre salarié). Posé par la base.';

-- ── 2) La règle du chef : toute l'équipe, 7 derniers jours ──────────────────
CREATE OR REPLACE FUNCTION public.is_my_team_member(p_user uuid, p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_lead()
     AND p_user IS NOT NULL
     AND p_date BETWEEN (now() AT TIME ZONE 'Europe/Paris')::date - 6
                    AND (now() AT TIME ZONE 'Europe/Paris')::date
     AND EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.id = p_user
          AND u.company_id = public.get_my_company_id()
          AND u.role::text IN ('worker', 'lead')
          AND u.is_active IS DISTINCT FROM false
     );
$function$;
REVOKE EXECUTE ON FUNCTION public.is_my_team_member(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_team_member(uuid, date) TO authenticated;

-- ── 3) Garde du chef : pas de doublon, trace posée par la base ──────────────
-- Nom choisi pour passer APRÈS time_entries_guard_write (ordre alphabétique).
CREATE OR REPLACE FUNCTION public.guard_time_entry_lead()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  -- Cron / service : il pose lui-même ses colonnes.
  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;

  IF public.is_lead() AND new.user_id IS DISTINCT FROM auth.uid() THEN
    IF TG_OP = 'INSERT' THEN
      -- Déjà une ligne ce jour-là sur ce chantier : on la corrige.
      IF EXISTS (
        SELECT 1 FROM public.time_entries t
         WHERE t.user_id = new.user_id AND t.work_date = new.work_date
           AND t.worksite_id = new.worksite_id AND t.status <> 'cancelled'
      ) THEN
        RAISE EXCEPTION 'time_entries: ce salarié a déjà une ligne ce jour-là sur ce chantier — corrigez-la'
          USING ERRCODE = 'P0001';
      END IF;
      new.lead_edited_by := auth.uid();
      new.lead_edited_at := now();
    ELSIF (new.start_time, new.end_time, new.break_minutes, new.worksite_id, new.meal_allowance)
          IS DISTINCT FROM (old.start_time, old.end_time, old.break_minutes, old.worksite_id, old.meal_allowance) THEN
      new.lead_edited_by := auth.uid();
      new.lead_edited_at := now();
    ELSE
      new.lead_edited_by := old.lead_edited_by;
      new.lead_edited_at := old.lead_edited_at;
    END IF;
    RETURN new;
  END IF;

  -- Tous les autres (le salarié lui-même, le bureau) : la trace ne bouge pas.
  IF TG_OP = 'INSERT' THEN
    new.lead_edited_by := NULL;
    new.lead_edited_at := NULL;
  ELSE
    new.lead_edited_by := old.lead_edited_by;
    new.lead_edited_at := old.lead_edited_at;
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_time_entry_lead() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_entries_lead_guard ON public.time_entries;
CREATE TRIGGER time_entries_lead_guard
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_lead();

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification après application :
--   SELECT count(*) FROM information_schema.columns WHERE table_name = 'time_entries'
--     AND column_name IN ('lead_edited_by','lead_edited_at');                          -- 2
--   SELECT count(*) FROM pg_trigger WHERE tgname = 'time_entries_lead_guard';          -- 1
--   SELECT prosrc LIKE '%- 6%' FROM pg_proc WHERE proname = 'is_my_team_member';      -- true
--
-- RETOUR ARRIÈRE (l'ancienne règle, mot pour mot) :
--   DROP TRIGGER IF EXISTS time_entries_lead_guard ON public.time_entries;
--   DROP FUNCTION IF EXISTS public.guard_time_entry_lead();
--   CREATE OR REPLACE FUNCTION public.is_my_team_member(p_user uuid, p_date date)
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
--   AS $function$
--     SELECT public.is_lead()
--        AND p_user IS NOT NULL
--        AND p_date = (now() AT TIME ZONE 'Europe/Paris')::date
--        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.company_id = public.get_my_company_id())
--        AND EXISTS (
--          SELECT 1
--          FROM (
--            SELECT p.worksite_id FROM public.planning p
--             WHERE p.user_id = auth.uid() AND p.work_date = p_date AND p.worksite_id IS NOT NULL
--            UNION
--            SELECT t.worksite_id FROM public.time_entries t
--             WHERE t.user_id = auth.uid() AND t.work_date = p_date AND t.worksite_id IS NOT NULL AND t.status <> 'cancelled'
--          ) AS mine
--          JOIN (
--            SELECT p.worksite_id FROM public.planning p
--             WHERE p.user_id = p_user AND p.work_date = p_date AND p.worksite_id IS NOT NULL
--            UNION
--            SELECT t.worksite_id FROM public.time_entries t
--             WHERE t.user_id = p_user AND t.work_date = p_date AND t.worksite_id IS NOT NULL AND t.status <> 'cancelled'
--          ) AS theirs ON theirs.worksite_id = mine.worksite_id
--        );
--   $function$;
--   (Les colonnes lead_edited_* restent : sans effet, la trace est gardée.)
