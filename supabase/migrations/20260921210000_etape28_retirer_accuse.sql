-- APPLIQUÉE EN PRODUCTION LE 21/09/2026, et vérifiée sur la STRUCTURE puis sur
-- le COMPORTEMENT :
--
--   table 0, prédicat 0, départ false, fermeture false, BT001 true ;
--   une seule signature pour `stop_active_session`, droits
--   {postgres, authenticated, service_role} inchangés ; trigger
--   `active_sessions_position_guard` en place ; la policy unique de
--   `time_entry_positions` toujours là ; 1 société allumée, 46 pointages,
--   0 position.
--
-- Puis le contrôle qui compte, SOUS `authenticated` et non sous `postgres` :
-- avec le vrai salarié de K Habitat et un vrai chantier de sa société, jwt
-- posé, bloc terminé par une exception donc entièrement annulé — réglage = t,
-- `lat = 46.205000`, `located_at` posé par le serveur. LA POSITION EST
-- CONSERVÉE : exactement ce que l'absence d'accusé empêchait une heure plus
-- tôt. Après coup : 0 session, 46 pointages, 0 position, 1 société allumée.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 28 — on démonte l'accusé de réception, parce que l'écran s'en va
-- ═════════════════════════════════════════════════════════════════════════════
--
-- CE QUI S'EST PASSÉ. L'étape 27 a fait de l'information préalable une garantie
-- technique : pas d'accusé, pas de position. Le mécanisme était juste. Sa
-- forme ne l'était pas — un mur noir plein écran avant de pointer, que le
-- salarié doit franchir pour commencer sa journée. Vu en vrai, ça fait peur et
-- ça freine. Aucun produit sérieux ne fait ça.
--
-- L'obligation d'information avait été transformée en blocage produit. Elle est
-- maintenue, sous une autre forme : une phrase à l'endroit du pointage, et le
-- détail dans la politique de confidentialité — là où on va le chercher quand
-- on veut vraiment savoir, et là où il peut être long sans gêner personne.
--
-- ⚠️ POURQUOI CETTE MIGRATION EST OBLIGATOIRE, ET PAS DU RANGEMENT.
--
-- Sans écran, plus aucune ligne n'est créée dans `position_notice_ack`. Donc
-- `has_position_notice()` serait faux POUR TOUJOURS, et les deux gardes
-- poseraient NULL indéfiniment. La garantie de l'étape 27 deviendrait un
-- blocage silencieux : le réglage allumé, le salarié informé, et aucune
-- position enregistrée — sans que rien ne le signale.
--
-- Retirer l'écran sans retirer la condition, c'est éteindre la fonction en
-- croyant la conserver.
--
-- ⚠️ LA CONDITION EST À DEUX ENDROITS, ET IL FAUT LES DEUX. C'est l'erreur que
-- l'étape 27 a failli commettre dans l'autre sens : la position de DÉPART passe
-- par le trigger sur `active_sessions`, la position de FERMETURE va du
-- navigateur droit dans `stop_active_session` sans jamais y passer. N'en
-- corriger qu'une laisserait la moitié du dispositif éteinte.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAT AU MOMENT D'ÉCRIRE, VÉRIFIÉ EN BASE ET NON SUPPOSÉ
-- ─────────────────────────────────────────────────────────────────────────────
--
--   1 société allumée (K Habitat)   ← le réglage n'est ni activé ni désactivé ici
--   1 accusé de réception
--   0 position enregistrée          ← personne ne perd rien
--
-- Les corps ci-dessous sont repris de `pg_get_functiondef` relu ce jour, jamais
-- des fichiers qui les ont créés. Seule la condition d'accusé disparaît : le
-- `BT001`, l'arrondi au quart d'heure, la fenêtre de quatorze heures, la
-- suppression de la session, l'heure de prise posée par le serveur — tout est
-- conservé mot pour mot.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · LA POSITION DE DÉPART
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_session_position()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  -- UNE SEULE CONDITION DÉSORMAIS : l'entreprise a allumé l'enregistrement.
  -- L'information du salarié n'est plus une ligne en base, c'est une phrase sur
  -- l'écran de pointage et une section dans la politique de confidentialité.
  IF NOT EXISTS (
       SELECT 1 FROM public.companies c
        WHERE c.id = new.company_id AND c.position_tracking_enabled
     )
  THEN
    new.start_lat        := NULL;
    new.start_lng        := NULL;
    new.start_accuracy_m := NULL;
    new.start_located_at := NULL;
    RETURN new;
  END IF;

  -- L'heure de la prise est celle du serveur, jamais celle du téléphone : une
  -- horloge avancée produirait un `captured_at` que la purge des douze mois ne
  -- rattraperait pas. (Étape 26.)
  IF new.start_lat IS NOT NULL AND new.start_lng IS NOT NULL THEN
    new.start_located_at := now();
  ELSE
    new.start_located_at := NULL;
  END IF;

  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.guard_session_position()
  FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · LA POSITION DE FERMETURE — L'AUTRE MOITIÉ
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `DROP FUNCTION` d'abord, par discipline : la signature est inchangée, donc
-- `CREATE OR REPLACE` suffirait — mais c'est le genre d'inattention qui a déjà
-- coûté à l'étape 26. Même transaction, donc aucun instant sans fonction.
DROP FUNCTION IF EXISTS public.stop_active_session(time, numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.stop_active_session(
  p_end      time    DEFAULT NULL,
  p_lat      numeric DEFAULT NULL,
  p_lng      numeric DEFAULT NULL,
  p_accuracy integer DEFAULT NULL
)
 RETURNS TABLE(entry_id uuid, work_date date, start_time time, end_time time)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  s record;
  v_local timestamp;
  v_start time;
  v_end time;
  v_id uuid;
  v_actif boolean;
  v_duree interval;
BEGIN
  SELECT * INTO s FROM public.active_sessions a WHERE a.user_id = auth.uid();
  IF s IS NULL THEN
    RAISE EXCEPTION 'Aucun pointage en cours';
  END IF;
  v_local := s.started_at AT TIME ZONE 'Europe/Paris';
  v_start := (date_trunc('hour', v_local)
              + (round(extract(minute FROM v_local) / 15.0) * interval '15 minutes'))::time;
  IF p_end IS NULL THEN
    v_local := now() AT TIME ZONE 'Europe/Paris';
    v_end := (date_trunc('hour', v_local)
              + (round(extract(minute FROM v_local) / 15.0) * interval '15 minutes'))::time;
  ELSE
    v_end := (date_trunc('hour', p_end::time)
              + (round(extract(minute FROM p_end::time) / 15.0) * interval '15 minutes'))::time;
  END IF;
  IF v_start = v_end THEN
    RAISE EXCEPTION 'Début et fin tombent sur le même quart d''heure : rien à enregistrer.'
      USING ERRCODE = 'BT001';
  END IF;

  INSERT INTO public.time_entries
    (company_id, user_id, worksite_id, planning_id, work_date,
     start_time, end_time, break_minutes, meal_allowance, status)
  VALUES
    (s.company_id, s.user_id, s.worksite_id, s.planning_id, s.work_date,
     v_start, v_end, 0, false, 'draft')
  RETURNING id INTO v_id;

  -- UNE SEULE CONDITION ICI AUSSI. La symétrie n'est pas décorative : c'est
  -- elle qui fait que « l'entreprise a allumé » veut dire la même chose des
  -- deux côtés.
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
    v_duree := now() - s.started_at;
    IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND v_duree <= interval '14 hours' THEN
      INSERT INTO public.time_entry_positions
        (company_id, entry_id, user_id, work_date, moment,
         latitude, longitude, accuracy_m, captured_at)
      VALUES
        (s.company_id, v_id, s.user_id, s.work_date, 'end',
         p_lat, p_lng, p_accuracy, now());
    END IF;
  END IF;

  DELETE FROM public.active_sessions a WHERE a.user_id = s.user_id;

  RETURN QUERY SELECT v_id, s.work_date, v_start, v_end;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.stop_active_session(time, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.stop_active_session(time, numeric, numeric, integer) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · LA TABLE ET LE PRÉDICAT S'EN VONT
-- ═════════════════════════════════════════════════════════════════════════════
--
-- CE N'EST PAS DU RANGEMENT, C'EST UNE OBLIGATION. `position_notice_ack`
-- contient une donnée personnelle — qui a lu, et quand. Une fois le mécanisme
-- retiré, cette donnée n'a plus AUCUNE finalité : ni preuve à servir, ni écran
-- à alimenter. Or une donnée personnelle conservée sans finalité est contraire
-- à l'article 5.1.b du RGPD, et sa conservation indéfinie au 5.1.e.
--
-- Laisser la table « au cas où » aurait donc été le choix le moins prudent des
-- deux, pas le plus prudent. Et accessoirement : du schéma mort qu'un lecteur
-- futur devra comprendre avant de pouvoir l'ignorer.
--
-- L'ORDRE COMPTE. Les deux fonctions ci-dessus ne référencent plus le prédicat ;
-- on peut donc le supprimer. `DROP TABLE` en dernier, car le prédicat la lit.
DROP FUNCTION IF EXISTS public.has_position_notice(uuid, uuid);
DROP TABLE    IF EXISTS public.position_notice_ack;

-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUI NE CHANGE PAS, ET QU'IL FAUT POUVOIR VÉRIFIER
-- ═════════════════════════════════════════════════════════════════════════════
--
--   · `position_tracking_enabled` reste la SEULE condition, et reste éteint par
--     défaut. Cette migration ne l'allume ni ne l'éteint nulle part.
--   · la fenêtre de quatorze heures à la fermeture ;
--   · la purge automatique à douze mois (`bemexo-purge-positions`) ;
--   · les policies de `time_entry_positions` — lecture par le bureau et par le
--     salarié concerné, AUCUNE policy d'écriture, le chef d'équipe exclu ;
--   · `BT001` sur le refus « même quart d'heure » ;
--   · le multi-chantier : `UNIQUE (entry_id, moment)` donne deux points par
--     LIGNE D'HEURES, pas par journée. Cinq pointages sur cinq chantiers le
--     17/09 donneraient dix points. Rien à ajouter, c'est déjà le cas.
--
-- Contrôle après application :
--
-- SELECT
--   (SELECT count(*) FROM pg_class
--     WHERE relname='position_notice_ack'
--       AND relnamespace='public'::regnamespace)                     AS table_attendu_0,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='has_position_notice')  AS predicat_attendu_0,
--   (SELECT pg_get_functiondef(p.oid) LIKE '%has_position_notice%'
--      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='guard_session_position') AS depart_attendu_false,
--   (SELECT pg_get_functiondef(p.oid) LIKE '%has_position_notice%'
--      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='stop_active_session')    AS fermeture_attendu_false,
--   (SELECT pg_get_functiondef(p.oid) LIKE '%ERRCODE = ''BT001''%'
--      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='stop_active_session')    AS bt001_attendu_true;
--
-- Et le contrôle qui compte, SOUS `authenticated` : un salarié de K Habitat qui
-- démarre un pointage doit voir sa position CONSERVÉE — c'est précisément ce
-- que l'absence d'accusé empêchait.
