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
--     existants, inchangés) ;
--   · CORRECTIF (avant mise en prod) : dans certaines entreprises les salariés
--     n'ouvrent jamais l'appli — c'est le chef qui saisit. Ce qu'il saisit ou
--     corrige est donc ENVOYÉ au bureau (lead_send_entries), avec le badge
--     « par le chef d'équipe ». Le salarié qui utilise l'appli garde la main :
--     il peut encore corriger tant que ce n'est pas validé (« modifié après
--     envoi » côté bureau, comme aujourd'hui) ;
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
--     fonction de trigger neuve, 1 trigger neuf, 1 fonction d'envoi neuve
--     (lead_send_entries). Aucune policy modifiée, aucune donnée touchée.
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
  -- Envoi par le chef (lead_send_entries) : la ligne part AU NOM du salarié
  -- (gardes du salarié appliqués), la trace désigne le chef.
  IF current_setting('bemexo.lead_send_by', true) IS NOT NULL
     AND current_setting('bemexo.lead_send_by', true) <> '' THEN
    new.lead_edited_by := current_setting('bemexo.lead_send_by', true)::uuid;
    new.lead_edited_at := now();
    RETURN new;
  END IF;

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

-- ── 4) Le chef ENVOIE ce qu'il a saisi (salariés qui n'ouvrent jamais l'appli) ─
-- Pour chaque ligne : vérifiée avec l'identité du CHEF (son équipe, 7 jours,
-- brouillon, non verrouillée), puis passée en « envoyée » AU NOM DU SALARIÉ :
-- tous les gardes du salarié s'appliquent (mois clôturé, salarié clôturé,
-- sortie oubliée « à compléter »…), `submitted_at` est posé comme d'habitude.
CREATE OR REPLACE FUNCTION public.lead_send_entries(p_ids uuid[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_lead uuid := auth.uid();
  r record;
  v_n integer := 0;
BEGIN
  IF v_lead IS NULL OR NOT public.is_lead() THEN
    RAISE EXCEPTION 'Réservé au chef d''équipe.' USING ERRCODE = '42501';
  END IF;
  FOR r IN
    SELECT t.id, t.user_id, t.work_date, t.status, t.locked, t.company_id
      FROM public.time_entries t WHERE t.id = ANY (p_ids)
     ORDER BY t.work_date, t.start_time
  LOOP
    IF r.company_id IS DISTINCT FROM public.get_my_company_id()
       OR r.user_id = v_lead
       OR NOT public.is_my_team_member(r.user_id, r.work_date) THEN
      RAISE EXCEPTION 'Ces heures ne sont pas dans votre équipe (7 derniers jours).' USING ERRCODE = '42501';
    END IF;
    IF r.locked OR r.status <> 'draft' THEN
      CONTINUE;  -- déjà envoyée, validée ou chez le comptable : rien à faire
    END IF;
    PERFORM set_config('request.jwt.claim.sub', r.user_id::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('bemexo.lead_send_by', v_lead::text, true);
    UPDATE public.time_entries SET status = 'submitted' WHERE id = r.id AND status = 'draft';
    v_n := v_n + 1;
    PERFORM set_config('bemexo.lead_send_by', '', true);
    PERFORM set_config('request.jwt.claim.sub', v_lead::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
  END LOOP;
  RETURN v_n;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.lead_send_entries(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_send_entries(uuid[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification après application :
--   SELECT count(*) FROM information_schema.columns WHERE table_name = 'time_entries'
--     AND column_name IN ('lead_edited_by','lead_edited_at');                          -- 2
--   SELECT count(*) FROM pg_trigger WHERE tgname = 'time_entries_lead_guard';          -- 1
--   SELECT prosrc LIKE '%- 6%' FROM pg_proc WHERE proname = 'is_my_team_member';      -- true
--   SELECT has_function_privilege('authenticated', 'public.lead_send_entries(uuid[])', 'EXECUTE'); -- true
--
-- RETOUR ARRIÈRE (l'ancienne règle, mot pour mot) :
--   DROP FUNCTION IF EXISTS public.lead_send_entries(uuid[]);
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
