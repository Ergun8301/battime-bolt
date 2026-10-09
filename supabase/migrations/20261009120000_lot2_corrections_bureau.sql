-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 2 (bureau) — CORRECTIONS AVEC MOTIF, « RENVOYER AU SALARIÉ »,
-- PAUSE / PANIER / ROUTE CORRIGÉS PAR LE BUREAU
-- ═════════════════════════════════════════════════════════════════════════════
-- PAS ENCORE APPLIQUÉE EN PRODUCTION : feu vert d'Ergun. Testée sur un Postgres
-- jetable : npm run test:corrections-bureau (supabase/tests/lot2_corrections_bureau.mjs).
--
-- 100 % ADDITIVE : 1 table, 3 fonctions, 1 fonction de trigger, 1 trigger.
-- Aucune table, colonne, policy, fonction ou trigger existant n'est modifié ;
-- aucune donnée n'est touchée. correct_time_entry, time_entry_corrections,
-- guard_time_entry_write / _delete restent mot pour mot.
--
-- POURQUOI. Le bureau ne corrigeait que le début et la fin d'une journée
-- envoyée, sans motif. Tout le reste (pause, panier, route, renvoyer la
-- journée en brouillon) ne pouvait se faire que par une écriture brute : pas de
-- trace, pas de motif, et le salarié découvrait la différence sur sa paie.
--
-- LA RÈGLE :
--   · le bureau corrige une ligne ENVOYÉE (ou validée) avec un motif de 3 à 500
--     caractères, que le salarié lit (office_correct_entry) ;
--   · le bureau RENVOIE une journée au salarié (office_return_day) : toutes ses
--     lignes envoyées repassent en brouillon, une ligne de journal par ligne ;
--     refusé si la journée est partie chez le comptable, mois ou salarié clôturé ;
--   · chaque geste écrit le journal `time_entry_edits` (avant / après, motif,
--     auteur) DANS LA MÊME TRANSACTION que les heures : pas de trace, pas de
--     correction. Personne n'écrit ce journal à la main (aucune policy
--     d'écriture) : il ne se falsifie pas ;
--   · une correction du début ou de la fin écrit AUSSI time_entry_corrections,
--     que les écrans actuels et `send-push` lisent déjà ;
--   · des heures envoyées une fois ne s'EFFACENT plus, bureau compris : elles
--     se retirent (statut 'cancelled'). Sans ça, une journée renvoyée en
--     brouillon pouvait être effacée par le salarié — et son historique avec.
--
-- DROITS. Les fonctions tournent avec les droits du propriétaire (SECURITY
-- DEFINER) : user_closed_until n'est pas exécutable par `authenticated`, et les
-- deux écritures (heures + journal) doivent passer ensemble. Le propriétaire
-- contourne la RLS : CHAQUE fonction vérifie donc elle-même l'entreprise et le
-- rôle. Les nouveaux objets reçoivent par défaut TOUS les droits pour anon et
-- authenticated en production : ils sont repris explicitement plus bas.
--
-- Tant que cette migration n'est pas appliquée, l'application se comporte
-- EXACTEMENT comme avant : la lecture du journal échoue en silence, la fiche
-- garde son panneau « Corriger les heures » (correct_time_entry), le salarié ne
-- voit aucun bandeau. Jamais de repli sur une écriture brute.

-- ── 1) Le journal des gestes du bureau ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entry_edits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  -- RESTRICT : une ligne d'heures qui a un historique ne disparaît pas avec lui.
  entry_id      uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE RESTRICT,
  worker_id     uuid NOT NULL REFERENCES public.users(id),
  work_date     date NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('correction', 'return')),
  reason        text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  edited_by     uuid NOT NULL REFERENCES public.users(id),
  edited_at     timestamptz NOT NULL DEFAULT now(),
  old_values    jsonb NOT NULL,
  new_values    jsonb NOT NULL,
  correction_id uuid REFERENCES public.time_entry_corrections(id) ON DELETE SET NULL,
  was_exported  boolean NOT NULL DEFAULT false,
  notified_at   timestamptz,
  notify_error  text,
  CONSTRAINT time_entry_edits_change_reelle CHECK (old_values IS DISTINCT FROM new_values)
);
CREATE INDEX IF NOT EXISTS time_entry_edits_entry_idx  ON public.time_entry_edits (entry_id, edited_at);
CREATE INDEX IF NOT EXISTS time_entry_edits_worker_idx ON public.time_entry_edits (worker_id, work_date DESC);
COMMENT ON TABLE public.time_entry_edits IS
  'Lot 2 : corrections (pause, panier, route, heures) et renvois au salarié faits par le bureau, avec motif. Écrit UNIQUEMENT par office_correct_entry / office_return_day (même transaction que les heures). Lu par le bureau et par le salarié concerné.';

ALTER TABLE public.time_entry_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.time_entry_edits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.time_entry_edits TO authenticated;
GRANT ALL ON public.time_entry_edits TO service_role;

-- Le bureau lit son entreprise ; le salarié lit SES lignes (il voit le motif).
DROP POLICY IF EXISTS time_entry_edits_select ON public.time_entry_edits;
CREATE POLICY time_entry_edits_select ON public.time_entry_edits FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR worker_id = auth.uid()));
-- Aucune policy INSERT / UPDATE / DELETE : seules les fonctions ci-dessous
-- écrivent (journal infalsifiable).

-- Support (lot 5) : la même lecture seule que sur time_entry_corrections.
DO $do$
BEGIN
  IF to_regprocedure('public.support_company_ids()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS support_read ON public.time_entry_edits';
    EXECUTE 'CREATE POLICY support_read ON public.time_entry_edits FOR SELECT TO authenticated '
            'USING (company_id = ANY ((SELECT public.support_company_ids())::uuid[]))';
  END IF;
END
$do$;

-- ── 2) Corriger une ligne envoyée, avec motif ──────────────────────────────
-- p_changes : objet JSON, une clé présente = « change-la ». Clés permises :
-- start_time, end_time, break_minutes, meal_allowance, gap_before ("" ou null
-- = plus de réponse). Rend les lignes de journal écrites (celle de la ligne
-- corrigée, plus celle d'une autre ligne dont le panier a été retiré).
CREATE OR REPLACE FUNCTION public.office_correct_entry(p_entry_id uuid, p_changes jsonb, p_reason text)
 RETURNS SETOF public.time_entry_edits
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := auth.uid(); v_co uuid; v_reason text := btrim(coalesce(p_reason, ''));
  e public.time_entries%ROWTYPE; o public.time_entries%ROWTYPE;
  v_start time; v_end time; v_break int; v_meal boolean; v_gap text;
  v_a1 int; v_a2 int; v_old jsonb; v_new jsonb; v_corr uuid; v_edit uuid; v_ids uuid[] := '{}';
BEGIN
  IF v_me IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501'; END IF;
  IF length(v_reason) < 3 THEN RAISE EXCEPTION 'Indiquez un motif (3 caractères au moins).' USING ERRCODE = '22023'; END IF;
  IF length(v_reason) > 500 THEN RAISE EXCEPTION 'Motif trop long (500 caractères au plus).' USING ERRCODE = '22023'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_changes) AS k(key)
                WHERE k.key NOT IN ('start_time', 'end_time', 'break_minutes', 'meal_allowance', 'gap_before')) THEN
    RAISE EXCEPTION 'Changement non pris en charge.' USING ERRCODE = '22023'; END IF;
  v_co := public.get_my_company_id();
  SELECT * INTO e FROM public.time_entries t WHERE t.id = p_entry_id AND t.company_id = v_co FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette ligne n''existe pas, ou vous n''y avez pas accès.' USING ERRCODE = 'P0002'; END IF;
  IF e.user_id = v_me THEN
    RAISE EXCEPTION 'Ce chemin sert à corriger les heures de quelqu''un d''autre.' USING ERRCODE = '42501'; END IF;
  IF e.status NOT IN ('submitted', 'validated') THEN
    RAISE EXCEPTION 'Seule une journée envoyée se corrige ici : un brouillon appartient encore au salarié.' USING ERRCODE = 'P0001'; END IF;
  -- Une heure ne « change » que si son HH:MM change (pas de minute réécrite pour rien).
  v_start := CASE WHEN p_changes ? 'start_time' AND left((p_changes->>'start_time')::time::text, 5) <> left(e.start_time::text, 5)
                  THEN (p_changes->>'start_time')::time ELSE e.start_time END;
  v_end   := CASE WHEN p_changes ? 'end_time' AND left((p_changes->>'end_time')::time::text, 5) <> left(e.end_time::text, 5)
                  THEN (p_changes->>'end_time')::time ELSE e.end_time END;
  v_break := CASE WHEN p_changes ? 'break_minutes' THEN (p_changes->>'break_minutes')::int ELSE coalesce(e.break_minutes, 0) END;
  v_meal  := CASE WHEN p_changes ? 'meal_allowance' THEN (p_changes->>'meal_allowance')::boolean ELSE coalesce(e.meal_allowance, false) END;
  v_gap   := CASE WHEN p_changes ? 'gap_before' THEN nullif(p_changes->>'gap_before', '') ELSE e.gap_before END;
  IF v_break IS NULL OR v_meal IS NULL THEN RAISE EXCEPTION 'Valeur manquante.' USING ERRCODE = '22023'; END IF;
  IF v_gap IS NOT NULL AND v_gap NOT IN ('route', 'pause') THEN
    RAISE EXCEPTION 'Avant ce chantier : route ou pause.' USING ERRCODE = '22023'; END IF;
  v_a1 := extract(hour FROM v_start)::int * 60 + extract(minute FROM v_start)::int;
  v_a2 := extract(hour FROM v_end)::int * 60 + extract(minute FROM v_end)::int;
  IF v_a2 < v_a1 THEN v_a2 := v_a2 + 1440; END IF;
  IF v_a2 = v_a1 THEN RAISE EXCEPTION 'Le début et la fin sont identiques.' USING ERRCODE = '22023'; END IF;
  IF v_break < 0 OR v_break >= v_a2 - v_a1 THEN
    RAISE EXCEPTION 'La pause doit être plus courte que la journée.' USING ERRCODE = '22023'; END IF;
  -- Chevauchement : même règle que day-hours.ts (1 minute tolérée), seulement si
  -- les heures bougent — une ligne qui en chevauchait déjà une autre doit
  -- pouvoir recevoir sa pause.
  IF (v_start, v_end) IS DISTINCT FROM (e.start_time, e.end_time) THEN
    SELECT * INTO o FROM public.time_entries x
     WHERE x.user_id = e.user_id AND x.work_date = e.work_date AND x.id <> e.id
       AND x.status <> 'cancelled' AND x.start_time <> x.end_time
       AND least(v_a2, extract(hour FROM x.end_time)::int * 60 + extract(minute FROM x.end_time)::int
                       + CASE WHEN x.end_time < x.start_time THEN 1440 ELSE 0 END)
         - greatest(v_a1, extract(hour FROM x.start_time)::int * 60 + extract(minute FROM x.start_time)::int) > 1
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Ces heures chevauchent %–% du même jour.', left(o.start_time::text, 5), left(o.end_time::text, 5) USING ERRCODE = 'P0001';
    END IF;
  END IF;
  v_old := jsonb_build_object('start_time', left(e.start_time::text, 5), 'end_time', left(e.end_time::text, 5),
            'break_minutes', coalesce(e.break_minutes, 0), 'meal_allowance', coalesce(e.meal_allowance, false),
            'gap_before', e.gap_before, 'status', e.status);
  v_new := jsonb_build_object('start_time', left(v_start::text, 5), 'end_time', left(v_end::text, 5),
            'break_minutes', v_break, 'meal_allowance', v_meal, 'gap_before', v_gap, 'status', e.status);
  IF v_new = v_old THEN RAISE EXCEPTION 'Rien n''a changé.' USING ERRCODE = 'P0001'; END IF;
  -- Panier : un seul par jour (index time_entries_one_meal_per_day). Retiré
  -- d'abord des autres lignes envoyées — et tracé aussi : le salarié doit voir
  -- pourquoi il a disparu de l'autre chantier.
  IF v_meal AND NOT coalesce(e.meal_allowance, false) THEN
    IF EXISTS (SELECT 1 FROM public.time_entries x WHERE x.user_id = e.user_id AND x.work_date = e.work_date AND x.id <> e.id
                 AND x.status = 'draft' AND x.meal_allowance) THEN
      RAISE EXCEPTION 'Le panier est déjà coché sur une ligne que le salarié n''a pas encore envoyée.' USING ERRCODE = 'P0001';
    END IF;
    FOR o IN SELECT * FROM public.time_entries x WHERE x.user_id = e.user_id AND x.work_date = e.work_date AND x.id <> e.id
               AND x.status IN ('submitted', 'validated') AND x.meal_allowance FOR UPDATE LOOP
      UPDATE public.time_entries SET meal_allowance = false WHERE id = o.id;
      INSERT INTO public.time_entry_edits (company_id, entry_id, worker_id, work_date, kind, reason, edited_by, old_values, new_values, was_exported)
      VALUES (o.company_id, o.id, o.user_id, o.work_date, 'correction', v_reason, v_me,
              jsonb_build_object('meal_allowance', true), jsonb_build_object('meal_allowance', false), o.exported_at IS NOT NULL)
      RETURNING id INTO v_edit;
      v_ids := v_ids || v_edit;
    END LOOP;
  END IF;
  UPDATE public.time_entries SET start_time = v_start, end_time = v_end, break_minutes = v_break, meal_allowance = v_meal, gap_before = v_gap
   WHERE id = e.id;  -- guard_time_entry_write (branche bureau) pose modified_at / modified_by
  IF (v_start, v_end) IS DISTINCT FROM (e.start_time, e.end_time) THEN  -- les écrans actuels continuent de lire ce journal-là
    INSERT INTO public.time_entry_corrections (company_id, entry_id, worker_id, work_date, corrected_by, corrected_by_role,
                                               old_start, old_end, new_start, new_end, was_exported)
    VALUES (e.company_id, e.id, e.user_id, e.work_date, v_me, 'admin', e.start_time, e.end_time, v_start, v_end, e.exported_at IS NOT NULL)
    RETURNING id INTO v_corr;
  END IF;
  INSERT INTO public.time_entry_edits (company_id, entry_id, worker_id, work_date, kind, reason, edited_by, old_values, new_values, correction_id, was_exported)
  VALUES (e.company_id, e.id, e.user_id, e.work_date, 'correction', v_reason, v_me, v_old, v_new, v_corr, e.exported_at IS NOT NULL)
  RETURNING id INTO v_edit;
  v_ids := v_ids || v_edit;
  RETURN QUERY SELECT * FROM public.time_entry_edits x WHERE x.id = ANY (v_ids) ORDER BY x.edited_at, x.id;
END $fn$;

-- ── 3) Renvoyer une journée au salarié, avec motif ─────────────────────────
-- Toutes les lignes envoyées de ce jour repassent en brouillon : elles ne
-- comptent plus (total, export) tant qu'il ne les a pas renvoyées. Refusé si
-- le salarié ne pourrait pas y toucher (chez le comptable, mois ou salarié
-- clôturé) : on ne renvoie pas un travail impossible à faire.
CREATE OR REPLACE FUNCTION public.office_return_day(p_user_id uuid, p_work_date date, p_reason text)
 RETURNS SETOF public.time_entry_edits
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := auth.uid(); v_co uuid; v_reason text := btrim(coalesce(p_reason, '')); v_until date;
  e public.time_entries%ROWTYPE; v_old jsonb; v_edit uuid; v_ids uuid[] := '{}';
BEGIN
  IF v_me IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501'; END IF;
  IF length(v_reason) < 3 THEN RAISE EXCEPTION 'Indiquez un motif (3 caractères au moins).' USING ERRCODE = '22023'; END IF;
  IF length(v_reason) > 500 THEN RAISE EXCEPTION 'Motif trop long (500 caractères au plus).' USING ERRCODE = '22023'; END IF;
  v_co := public.get_my_company_id();
  IF p_user_id IS NULL OR p_work_date IS NULL OR p_user_id = v_me THEN
    RAISE EXCEPTION 'Journée introuvable.' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.company_id = v_co AND u.is_active IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'Salarié introuvable ou archivé.' USING ERRCODE = 'P0002'; END IF;
  IF public.is_month_closed(v_co, p_work_date) THEN
    RAISE EXCEPTION 'Mois clôturé : rouvrez-le avant de renvoyer cette journée.' USING ERRCODE = 'P0001'; END IF;
  v_until := public.user_closed_until(p_user_id);
  IF v_until IS NOT NULL AND p_work_date <= v_until THEN
    RAISE EXCEPTION 'Heures clôturées jusqu''au % : rouvrez-les avant de renvoyer cette journée.', to_char(v_until, 'DD/MM/YYYY') USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.time_entries t WHERE t.company_id = v_co AND t.user_id = p_user_id AND t.work_date = p_work_date FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.time_entries t WHERE t.company_id = v_co AND t.user_id = p_user_id AND t.work_date = p_work_date
               AND t.status IN ('submitted', 'validated') AND (t.locked OR t.exported_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Journée déjà partie chez le comptable : corrigez-la plutôt que de la renvoyer.' USING ERRCODE = 'P0001';
  END IF;
  FOR e IN SELECT * FROM public.time_entries t WHERE t.company_id = v_co AND t.user_id = p_user_id AND t.work_date = p_work_date
             AND t.status IN ('submitted', 'validated') ORDER BY t.start_time LOOP
    v_old := jsonb_build_object('start_time', left(e.start_time::text, 5), 'end_time', left(e.end_time::text, 5),
              'break_minutes', coalesce(e.break_minutes, 0), 'meal_allowance', coalesce(e.meal_allowance, false),
              'gap_before', e.gap_before, 'status', e.status);
    UPDATE public.time_entries SET status = 'draft' WHERE id = e.id;  -- submitted_at reste : « déjà envoyée une fois »
    INSERT INTO public.time_entry_edits (company_id, entry_id, worker_id, work_date, kind, reason, edited_by, old_values, new_values)
    VALUES (e.company_id, e.id, e.user_id, e.work_date, 'return', v_reason, v_me, v_old, v_old || '{"status":"draft"}'::jsonb)
    RETURNING id INTO v_edit;
    v_ids := v_ids || v_edit;
  END LOOP;
  IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'Rien d''envoyé ce jour-là.' USING ERRCODE = 'P0002'; END IF;
  RETURN QUERY SELECT * FROM public.time_entry_edits x WHERE x.id = ANY (v_ids) ORDER BY x.edited_at, x.id;
END $fn$;

-- ── 4) L'issue de la notification, inscrite une fois, par l'auteur ─────────
-- Même idée que time_entry_corrections : « pas prévenu » est un fait à montrer.
CREATE OR REPLACE FUNCTION public.office_edit_mark_notified(p_ids uuid[], p_error text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non connecté.' USING ERRCODE = '42501'; END IF;
  UPDATE public.time_entry_edits x
     SET notified_at = CASE WHEN p_error IS NULL THEN now() END, notify_error = left(p_error, 200)
   WHERE x.id = ANY (p_ids) AND x.edited_by = auth.uid() AND x.notified_at IS NULL AND x.notify_error IS NULL
     AND x.edited_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $fn$;

-- ── 5) Des heures envoyées une fois ne s'EFFACENT plus ─────────────────────
-- Bureau compris : elles se retirent (statut 'cancelled'). Ne remplace pas
-- guard_time_entry_delete : s'y ajoute. Cron / service_role (auth.uid() nul)
-- inchangés — la clé étrangère du journal (RESTRICT) protège quand même une
-- ligne qui a un historique.
CREATE OR REPLACE FUNCTION public.guard_time_entry_keep_sent()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN old; END IF;
  IF old.status <> 'draft' OR old.submitted_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.time_entry_edits x WHERE x.entry_id = old.id)
     OR EXISTS (SELECT 1 FROM public.time_entry_corrections c WHERE c.entry_id = old.id) THEN
    RAISE EXCEPTION 'time_entries: heures déjà envoyées — elles se retirent, elles ne s''effacent pas' USING ERRCODE = 'P0001';
  END IF;
  RETURN old;
END $fn$;
DROP TRIGGER IF EXISTS time_entries_keep_sent ON public.time_entries;
CREATE TRIGGER time_entries_keep_sent BEFORE DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_keep_sent();

-- ── 6) Droits (repris explicitement : voir « DROITS » en tête) ──────────────
REVOKE ALL ON FUNCTION public.office_correct_entry(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.office_return_day(uuid, date, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.office_edit_mark_notified(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_correct_entry(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_return_day(uuid, date, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_edit_mark_notified(uuid[], text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_time_entry_keep_sent() FROM PUBLIC, anon, authenticated;

-- Contrôles après application :
-- SELECT count(*) FROM pg_policies WHERE tablename = 'time_entry_edits';               -- 2
-- SELECT count(*) FROM pg_trigger WHERE tgname = 'time_entries_keep_sent';             -- 1
-- SELECT has_function_privilege('anon', 'public.office_return_day(uuid, date, text)', 'EXECUTE');  -- false

-- RETOUR ARRIÈRE (rien d'existant n'a été remplacé : on retire ce qui a été ajouté) :
--   DROP TRIGGER IF EXISTS time_entries_keep_sent ON public.time_entries;
--   DROP FUNCTION IF EXISTS public.guard_time_entry_keep_sent();
--   DROP FUNCTION IF EXISTS public.office_edit_mark_notified(uuid[], text);
--   DROP FUNCTION IF EXISTS public.office_return_day(uuid, date, text);
--   DROP FUNCTION IF EXISTS public.office_correct_entry(uuid, jsonb, text);
--   DROP TABLE IF EXISTS public.time_entry_edits;   -- ⚠ efface l'historique des motifs
