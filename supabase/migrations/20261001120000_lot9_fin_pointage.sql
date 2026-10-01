-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 9 — « J'AI FINI » À N'IMPORTE QUEL MOMENT, À LA MINUTE PRÈS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- NON appliquée : feu vert d'Ergun.
--
-- 100 % ADDITIVE. Une fonction NOUVELLE, `finish_active_session`. Rien d'autre :
-- `stop_active_session` reste telle quelle (la borne et les anciennes versions
-- de l'application continuent de l'appeler), aucune table, aucune policy,
-- aucune colonne n'est touchée. Tant que cette migration n'est pas passée,
-- l'application retombe sur `stop_active_session` (PGRST202 / 42883) : rien
-- ne casse, on garde seulement l'ancien comportement.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI
--
-- `stop_active_session` arrondit le début ET la fin au quart d'heure le plus
-- proche. Deux conséquences vues sur le terrain :
--
--   1. L'ARRONDI PEUT COÛTER JUSQU'À ~14 MINUTES AU SALARIÉ. Arrivé à 08:07:40
--      (→ 08:15), parti à 16:52:20 (→ 16:45) : un quart d'heure de travail réel
--      disparaît de la paie, sans que personne ne l'ait décidé.
--
--   2. BT001 BLOQUE LES POINTAGES COURTS. Début et fin dans le même quart
--      d'heure → refus, et le chrono reste ouvert : le salarié qui a lancé un
--      pointage par erreur ne pouvait ni l'arrêter ni (avant le bouton
--      « Annuler ») s'en débarrasser. « J'ai fini » doit marcher à tout moment.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA RÈGLE : L'ARRONDI NE PÉNALISE JAMAIS
--
--   · Début = la minute du début, TRONQUÉE (08:07:40 → 08:07) : jamais après le
--     vrai début.
--   · Fin   = la minute de fin, ARRONDIE AU-DESSUS (08:14:20 → 08:15) : jamais
--     avant la vraie fin. Seule exception : si ce plafond passe minuit
--     (23:59:30 → 00:00), on retient 23:59 — la ligne reste sur son jour.
--   · Au total, au plus +2 minutes EN FAVEUR du salarié (moins d'une minute de
--     chaque côté), jamais une minute contre lui.
--   · Moins d'une minute écoulée : ce n'est pas du travail, c'est un appui de
--     trop. Le pointage est ANNULÉ SANS ERREUR (aucune ligne d'heures, chrono
--     effacé) et la fonction le dit : `cancelled = true`.
--   · Pointage oublié (heure de fin donnée par le salarié, `p_end`) : on prend
--     SON heure, à la minute, telle quelle. Fin ≤ début LE MÊME JOUR : rien à
--     compter, même annulation silencieuse (l'écran vérifie avant d'appeler,
--     pour que le salarié corrige plutôt que de perdre son pointage).
--   · NUIT À CHEVAL : chrono ouvert un jour PRÉCÉDENT (18:00) et fin donnée
--     avant le début (00:30) = fin LE LENDEMAIN. La ligne est écrite comme
--     `stop_active_session` l'a toujours fait (début 18:00, fin 00:30, sur le
--     jour du début) : `time_entries.total_minutes`, calculé par Postgres,
--     compte la nuit (+1440). Sans ça, un poste du soir (restauration) ne
--     pouvait plus être fermé passé minuit. Fin = début : annulé, comme avant.
--
-- Le reste est la COPIE de `stop_active_session` (étape 28) : même insertion
-- (brouillon, panier non coché), même bloc de positions (interrupteur de
-- l'entreprise, 14 heures au plus pour la fin), même suppression du chrono,
-- dans la même transaction. `FOR UPDATE` en plus : deux « J'ai fini » partis
-- en même temps (téléphone + borne) ne créent pas deux lignes — le second
-- attend le premier, puis ne trouve plus de chrono.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.finish_active_session(
  p_end      time    DEFAULT NULL,
  p_lat      numeric DEFAULT NULL,
  p_lng      numeric DEFAULT NULL,
  p_accuracy integer DEFAULT NULL
)
 RETURNS TABLE(entry_id uuid, work_date date, start_time time, end_time time, cancelled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  s record;
  v_local timestamp;
  v_plafond timestamp;
  v_start time;
  v_end time;
  v_id uuid;
  v_actif boolean;
  v_duree interval;
  v_nuit boolean;
BEGIN
  SELECT * INTO s FROM public.active_sessions a WHERE a.user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun pointage en cours';
  END IF;

  -- Début : la minute tronquée, jamais après le vrai début.
  v_start := date_trunc('minute', s.started_at AT TIME ZONE 'Europe/Paris')::time;
  v_duree := now() - s.started_at;

  IF p_end IS NULL THEN
    -- Moins d'une minute : un appui de trop, pas une heure travaillée. On
    -- efface CE chrono-là (user_id ET started_at) et on le dit, sans erreur.
    IF v_duree < interval '1 minute' THEN
      DELETE FROM public.active_sessions a
       WHERE a.user_id = s.user_id AND a.started_at = s.started_at;
      RETURN QUERY SELECT NULL::uuid, s.work_date, NULL::time, NULL::time, true;
      RETURN;
    END IF;
    -- Fin : la minute arrondie au-dessus, jamais avant la vraie fin.
    v_local := now() AT TIME ZONE 'Europe/Paris';
    v_plafond := date_trunc('minute', v_local);
    IF v_plafond < v_local THEN
      v_plafond := v_plafond + interval '1 minute';
    END IF;
    IF v_plafond::date > v_local::date THEN
      v_end := time '23:59';
    ELSE
      v_end := v_plafond::time;
    END IF;
    -- Pathologique (exactement 24 h, à la minute) : début = fin. On ne devine
    -- pas, on ne jette pas non plus un si long pointage : même refus qu'avant.
    IF v_end = v_start THEN
      RAISE EXCEPTION 'Début et fin identiques : rien à enregistrer.'
        USING ERRCODE = 'BT001';
    END IF;
  ELSE
    -- Pointage oublié : l'heure du salarié, à la minute, telle quelle.
    v_end := date_trunc('minute', p_end)::time;
    -- Chrono d'un jour PRÉCÉDENT et fin avant le début : fini le lendemain
    -- (nuit à cheval), ligne écrite telle quelle, comme stop_active_session.
    v_nuit := v_end < v_start AND s.work_date < (now() AT TIME ZONE 'Europe/Paris')::date;
    IF v_end <= v_start AND NOT v_nuit THEN
      DELETE FROM public.active_sessions a
       WHERE a.user_id = s.user_id AND a.started_at = s.started_at;
      RETURN QUERY SELECT NULL::uuid, s.work_date, NULL::time, NULL::time, true;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.time_entries
    (company_id, user_id, worksite_id, planning_id, work_date,
     start_time, end_time, break_minutes, meal_allowance, status)
  VALUES
    (s.company_id, s.user_id, s.worksite_id, s.planning_id, s.work_date,
     v_start, v_end, 0, false, 'draft')
  RETURNING id INTO v_id;

  -- Même bloc que `stop_active_session` : une seule condition, des deux côtés.
  SELECT c.position_tracking_enabled INTO v_actif
    FROM public.companies c WHERE c.id = s.company_id;

  IF coalesce(v_actif, false) THEN
    IF s.start_lat IS NOT NULL AND s.start_lng IS NOT NULL THEN
      INSERT INTO public.time_entry_positions
        (company_id, entry_id, user_id, work_date, moment,
         latitude, longitude, accuracy_m, captured_at)
      VALUES
        (s.company_id, v_id, s.user_id, s.work_date, 'start',
         s.start_lat, s.start_lng, s.start_accuracy_m,
         coalesce(s.start_located_at, s.started_at));
    END IF;

    -- Au-delà de quatorze heures, on écarte : un pointage oublié et fermé le
    -- soir chez soi enregistrerait un domicile. (Étape 26.)
    IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND v_duree <= interval '14 hours' THEN
      INSERT INTO public.time_entry_positions
        (company_id, entry_id, user_id, work_date, moment,
         latitude, longitude, accuracy_m, captured_at)
      VALUES
        (s.company_id, v_id, s.user_id, s.work_date, 'end',
         p_lat, p_lng, p_accuracy, now());
    END IF;
  END IF;

  DELETE FROM public.active_sessions a
   WHERE a.user_id = s.user_id AND a.started_at = s.started_at;

  RETURN QUERY SELECT v_id, s.work_date, v_start, v_end, false;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.finish_active_session(time, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finish_active_session(time, numeric, numeric, integer) TO authenticated;
