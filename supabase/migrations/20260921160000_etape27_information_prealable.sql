-- APPLIQUÉE EN PRODUCTION LE 21/09/2026, et vérifiée deux fois : sur la
-- STRUCTURE (table + RLS + exactement 2 policies, aucune UPDATE ni DELETE ;
-- `has_position_notice` présent ; `stop_active_session` à une seule signature
-- avec son `BT001` ; les DEUX chemins appellent bien le prédicat, relu dans
-- `pg_get_functiondef` et non dans ce fichier ; trigger en place ; 0 société
-- activée, 46 pointages, 0 position, 0 accusé) — puis sur le COMPORTEMENT, en
-- production, dans un bloc terminé par une exception donc entièrement annulé :
-- sans accusé le pointage démarre et la position est refusée, avec accusé la
-- même insertion garde la position et l'heure posée par le serveur. Contrôle
-- après coup : rien n'a survécu.
--
-- ⚠️ UN CORRECTIF SUIT : `20260921170000_etape27b_revoquer_predicat.sql`.
-- `has_position_notice` a été créée SANS `REVOKE`, donc accessible à PUBLIC et
-- à `anon` par les default privileges du schéma — c'est-à-dire appelable sans
-- compte, avec des UUID arbitraires, en contournant la policy écrite ici même.
-- Trouvé par Codex après l'application. Voir ce fichier.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 27 — L'information préalable devient une garantie technique
-- ═════════════════════════════════════════════════════════════════════════════
--
-- CE QUE L'ÉTAPE 26 A LAISSÉ EN PROMESSE. L'écran de réglages rappelait à
-- l'employeur qu'il doit informer chacun de ses salariés avant toute collecte
-- (art. L1222-4 du code du travail), et que sans cette information la donnée
-- ne vaut RIEN comme preuve — donc que la fonction ne sert à rien. Mais rien
-- ne l'empêchait d'allumer l'interrupteur et de ne rien dire à personne.
--
-- La note papier est abandonnée : l'information se fait dans BEMEXO, et la
-- base vérifie qu'elle a eu lieu. Pas d'accusé, pas de position. Une obligation
-- qui dépend de la bonne volonté de quinze entreprises n'est pas une garantie.
--
-- CE QUE CET ACCUSÉ N'EST PAS : UN CONSENTEMENT. Dans une relation de travail
-- le consentement n'est pas libre, et la base légale reste l'intérêt légitime.
-- « J'ai compris » atteste qu'on a été INFORMÉ, rien d'autre. D'où l'absence de
-- bouton « je refuse » : refuser se fait au moment où le téléphone pose sa
-- propre question, et ce refus-là est sans conséquence.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · LA TABLE
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.position_notice_ack (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- LA SOCIÉTÉ QUI A INFORMÉ, et pas seulement le salarié informé.
  --
  -- Aujourd'hui c'est redondant : aucun chemin de l'application ne déplace un
  -- salarié d'une société à une autre (vérifié), donc `user_id` suffirait. On
  -- le porte quand même, pour deux raisons qui ne coûtent rien :
  --
  --   · L'OBLIGATION EST CELLE DE CHAQUE EMPLOYEUR. Un salarié informé par
  --     l'entreprise A n'a pas été informé par l'entreprise B. Le jour où un
  --     transfert existera, l'accusé ne le suivra pas — et c'est le bon
  --     comportement, pas une régression à découvrir.
  --   · La policy de lecture du bureau s'écrit alors comme celle de
  --     `time_entry_positions`, sans jointure sur `users`.
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),

  -- On n'est informé qu'une fois par employeur. Le bouton peut être pressé deux
  -- fois (double tap, reprise réseau) : la base tranche, pas l'écran.
  CONSTRAINT position_notice_ack_une_fois UNIQUE (user_id, company_id)
);

ALTER TABLE public.position_notice_ack ENABLE ROW LEVEL SECURITY;

-- ── LECTURE ────────────────────────────────────────────────────────────────
-- Le salarié voit son propre accusé. Le bureau voit ceux de sa société —
-- c'est lui qui doit pouvoir prouver qu'il a informé, et c'est tout l'objet
-- de cette table. Le chef d'équipe n'y a rien à faire : savoir qui a lu quoi
-- n'est pas une information d'équipe.
CREATE POLICY position_notice_ack_select ON public.position_notice_ack
  FOR SELECT USING (
    company_id = public.get_my_company_id()
    AND (public.is_admin() OR user_id = auth.uid())
  );

-- ── ÉCRITURE : SON PROPRE ACCUSÉ, ET RIEN D'AUTRE ──────────────────────────
-- Sans `user_id = auth.uid()`, un bureau pourrait fabriquer l'accusé de ses
-- salariés — c'est-à-dire fabriquer la preuve qu'il les a informés. Une preuve
-- que le contrôlé peut écrire à la place du contrôleur ne vaut rien.
CREATE POLICY position_notice_ack_insert ON public.position_notice_ack
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND company_id = public.get_my_company_id()
  );

-- Aucune policy UPDATE, aucune policy DELETE. Un accusé ne se redate pas et ne
-- s'efface pas : il atteste d'un fait daté. Si un employeur doit ré-informer
-- ses salariés — texte modifié, finalité élargie — cela demandera une nouvelle
-- ligne, donc une évolution assumée de cette table, pas un DELETE discret.

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · LE PRÉDICAT, ÉCRIT UNE SEULE FOIS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI UNE FONCTION POUR UN `EXISTS` DE TROIS LIGNES. Parce que cette règle
-- doit être appliquée à DEUX endroits, et que deux copies d'une même règle
-- finissent toujours par diverger — ce projet en a déjà payé le prix (le double
-- verrou de `/poseur`, les deux définitions de « ça compte »).
--
-- Les deux endroits, et il faut les nommer, parce que le plan initial n'en
-- voyait qu'un :
--
--   · `guard_session_position()`, trigger sur `active_sessions`, qui porte la
--     position de DÉPART ;
--   · `stop_active_session()`, qui reçoit la position de FERMETURE
--     DIRECTEMENT du navigateur, sans jamais passer par `active_sessions`.
--
-- Ne garder que le premier aurait laissé enregistrer la position de fermeture
-- d'un salarié jamais informé — c'est-à-dire, dans le cas du pointage oublié et
-- fermé le soir, son DOMICILE. La moitié manquante était la pire des deux.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  L'ÉCRAN BARRE LA POSITION, JAMAIS LES HEURES.                           │
-- │                                                                          │
-- │  Quand ce prédicat est faux, les deux côtés posent NULL et CONTINUENT.   │
-- │  Ni exception, ni refus, ni blocage : le pointage démarre, le pointage    │
-- │  se ferme, les heures comptent. Seule la position n'est pas écrite.      │
-- │                                                                          │
-- │  Si quelqu'un est tenté, un jour, de transformer ça en `RAISE EXCEPTION` │
-- │  — « c'est plus propre, on saura pourquoi » — c'est la seule ligne à      │
-- │  relire : un salarié ne perd pas ses heures parce qu'un écran            │
-- │  d'information ne lui a pas été montré.                                   │
-- └──────────────────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.has_position_notice(p_user uuid, p_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.position_notice_ack a
     WHERE a.user_id = p_user AND a.company_id = p_company
  );
$fn$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · LA POSITION DE DÉPART
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Corps repris de la définition EN BASE (`pg_get_functiondef`, relue le
-- 21/09/2026), pas du fichier de l'étape 26 — c'est la règle que l'étape 26 a
-- appris à ses dépens. Seule la condition d'entrée change.
CREATE OR REPLACE FUNCTION public.guard_session_position()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  -- DEUX CONDITIONS, ET IL LES FAUT TOUTES LES DEUX : l'entreprise a allumé
  -- l'enregistrement, ET ce salarié-là a vu l'écran d'information. La seconde
  -- ne se déduit pas de la première : un employeur peut très bien allumer
  -- l'interrupteur sans avoir prévenu qui que ce soit, et c'est exactement
  -- l'oubli que cette étape rend impossible.
  IF NOT EXISTS (
       SELECT 1 FROM public.companies c
        WHERE c.id = new.company_id AND c.position_tracking_enabled
     )
     OR NOT public.has_position_notice(new.user_id, new.company_id)
  THEN
    new.start_lat        := NULL;
    new.start_lng        := NULL;
    new.start_accuracy_m := NULL;
    new.start_located_at := NULL;
    RETURN new;
  END IF;

  -- L'heure de la prise est celle du serveur, jamais celle du téléphone : une
  -- horloge avancée produirait un `captured_at` que la purge des douze mois ne
  -- rattraperait pas. (Étape 26, remarque de Codex.)
  IF new.start_lat IS NOT NULL AND new.start_lng IS NOT NULL THEN
    new.start_located_at := now();
  ELSE
    new.start_located_at := NULL;
  END IF;

  RETURN new;
END;
$fn$;

-- Le trigger existe déjà (étape 26) et pointe sur cette fonction : rien à
-- recréer. On le redéclare quand même, pour que cette migration reste
-- exécutable sur une base où l'étape 26 aurait été appliquée autrement.
DROP TRIGGER IF EXISTS active_sessions_position_guard ON public.active_sessions;
CREATE TRIGGER active_sessions_position_guard
  BEFORE INSERT OR UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_session_position();

-- ═════════════════════════════════════════════════════════════════════════════
-- 4 · LA POSITION DE FERMETURE — LA MOITIÉ QUI MANQUAIT
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `DROP FUNCTION` D'ABORD, MÊME SANS CHANGER LA SIGNATURE. Elle est
-- inchangée ici, donc `CREATE OR REPLACE` suffirait — mais l'étape 26 a montré
-- ce que coûte l'inattention sur ce point, et le drop explicite ne coûte rien.
-- Il est dans la même transaction que la création : aucun instant sans
-- fonction.
--
-- Corps repris de la production, relu le 21/09/2026. Tout y est conservé :
-- l'arrondi au quart d'heure, le refus `BT001`, la fenêtre de quatorze heures,
-- la suppression de la session. Une seule condition est ajoutée.
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

  -- ── LA MÊME DOUBLE CONDITION QUE POUR LE DÉPART ─────────────────────────
  -- `has_position_notice` est le MÊME prédicat, appelé depuis le second des
  -- deux chemins. C'est tout l'intérêt de l'avoir sorti dans une fonction : il
  -- n'existe pas de version de cette règle qui puisse dériver de l'autre.
  --
  -- LE POINTAGE SE FERME QUAND MÊME. Refuser la fermeture parce qu'un salarié
  -- n'a pas vu un écran d'information reviendrait à lui bloquer ses heures pour
  -- protéger une donnée qu'on ne voulait justement pas collecter.
  SELECT c.position_tracking_enabled INTO v_actif
    FROM public.companies c WHERE c.id = s.company_id;

  IF coalesce(v_actif, false)
     AND public.has_position_notice(s.user_id, s.company_id)
  THEN
    -- Le départ. Déjà à NULL si l'accusé manquait au démarrage — un salarié qui
    -- accuse réception EN COURS de pointage n'aura donc que son point de
    -- fermeture, ce qui est exact : on ne pouvait pas capter le départ, on ne
    -- l'invente pas après coup.
    IF s.start_lat IS NOT NULL AND s.start_lng IS NOT NULL THEN
      INSERT INTO public.time_entry_positions
        (company_id, entry_id, user_id, work_date, moment,
         latitude, longitude, accuracy_m, captured_at)
      VALUES
        (s.company_id, v_id, s.user_id, s.work_date, 'start',
         s.start_lat, s.start_lng, s.start_accuracy_m,
         coalesce(s.start_located_at, s.started_at));
    END IF;

    -- La fermeture. Au-delà de quatorze heures, on écarte : un pointage oublié
    -- et fermé le soir chez soi enregistrerait un domicile. (Étape 26.)
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
-- CE QUE J'AI ENVISAGÉ ET ÉCARTÉ
-- ═════════════════════════════════════════════════════════════════════════════
--
-- UN BOUTON « JE REFUSE » sur l'écran. Écarté, et pas par paresse : il
-- transformerait l'information en consentement, alors que le consentement d'un
-- salarié n'est pas une base légale valable dans une relation de travail. Pire,
-- il rendrait le refus VISIBLE et traçable — c'est-à-dire qu'il fabriquerait
-- une liste de ceux qui ont dit non, exactement ce que l'étape 26 s'est
-- interdit. Le refus se fait sur la question du téléphone, qui ne laisse
-- aucune trace chez nous.
--
-- BLOQUER LE POINTAGE tant que l'écran n'est pas passé. Écarté : `/poseur`
-- fonctionne hors réseau, et l'accusé demande une écriture. Un salarié en
-- sous-sol se serait retrouvé enfermé derrière un écran d'information, sans
-- pouvoir noter ses heures. L'écran barre la POSITION, jamais les HEURES — et
-- c'est cette migration qui le garantit, pas l'écran.
--
-- Contrôle après application :
-- SELECT
--   (SELECT count(*) FROM pg_policy
--     WHERE polrelid='public.position_notice_ack'::regclass)            AS policies_attendu_2,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='has_position_notice')     AS predicat_attendu_1,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='stop_active_session')     AS fermeture_attendu_1,
--   (SELECT pg_get_functiondef(p.oid) LIKE '%ERRCODE = ''BT001''%'
--      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='stop_active_session')     AS bt001_toujours_la;
