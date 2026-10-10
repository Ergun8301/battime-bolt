-- ═════════════════════════════════════════════════════════════════════════════
-- FORMATIONS (lot 6, oct. 2026) : un lien vidéo (YouTube / Vimeo / Google
-- Drive) ou un document déjà téléversé, pour toute l'équipe ou certains
-- salariés ; le salarié l'ouvre et coche « Vue » ; le bureau voit qui l'a vue.
-- ═════════════════════════════════════════════════════════════════════════════
-- PAS ENCORE APPLIQUÉE EN PRODUCTION : Cowork la relit et l'applique. Testée sur
-- un Postgres jetable : npm run test:formations-db (supabase/tests/lot6_formations.mjs),
-- avec les droits PAR DÉFAUT de production, chargée deux fois, puis retirée par
-- le bloc de retour arrière (fin du fichier) et rechargée.
--
-- 100 % ADDITIVE : 2 tables neuves, 2 fonctions neuves, 1 fonction de trigger
-- et 1 trigger (sur la table neuve trainings seulement). Aucune table, colonne,
-- policy, fonction ou trigger existant n'est modifié ; aucune donnée existante
-- n'est touchée. Rejouable (IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS sur
-- les seuls objets neufs). Aucun bucket neuf : un document de formation est une
-- ligne de `documents` (bucket privé chantier-docs), que toute l'entreprise lit
-- déjà (documents_select, chantier_docs_read) — rien de plus n'est exposé.
--
-- UN SEUL EFFACEMENT, À SAVOIR : dans set_training_seen, « Annuler » retire la
-- « Vue » de l'appelant LUI-MÊME, sur une formation qui lui est destinée, et
-- seulement dans les 10 minutes qui suivent. Rien d'autre ne s'efface : une
-- formation se « retire » (archived_at) et ses « Vue » restent (preuve qu'une
-- formation sécurité a été vue). Aucune policy DELETE, aucun droit DELETE.
--
-- PAS D'HÉBERGEMENT VIDÉO : la base ne garde que le lien. La contrainte
-- n'accepte qu'un lien https vers YouTube, Vimeo ou Google Drive — même règle
-- que supabase/functions/_shared/trainings.ts (le test vérifie que les deux sont
-- identiques) : javascript:, data:, http:, un autre site, un identifiant ou un
-- port dans l'adresse sont refusés par la base elle-même. Jamais d'iframe : le
-- lien s'ouvre dans un nouvel onglet.
--
-- NE COMPTE JAMAIS COMME HEURES : rien ici n'écrit planning, time_entries ou
-- active_sessions ; totaux, export de paie, coûts, relances et borne ne lisent
-- pas ces tables.
--
-- QUI VOIT QUOI
--   · le bureau (is_admin) lit, ajoute, retire et remet les formations de SON
--     entreprise — droits PAR COLONNE : ni id, ni created_by, ni created_at, ni
--     archived_at à l'insertion ; ni company_id, ni created_by en modification ;
--   · le salarié et le chef d'équipe ne lisent PAS la table : ils passent par
--     my_trainings(), qui ne rend QUE les formations qui leur sont destinées
--     (toute l'équipe — nouveaux venus compris — ou leur nom dans la liste),
--     sans la liste des autres destinataires ;
--   · « Vue » s'écrit UNIQUEMENT par set_training_seen() : sa propre ligne, une
--     formation qui lui est destinée, date posée par le serveur ;
--   · le bureau lit les « Vue » de son entreprise ; le salarié, les siennes ;
--   · un compte bureau n'est pas dans le public d'une formation.
--
-- DROITS. Tout objet neuf reçoit par défaut TOUS les droits pour anon et
-- authenticated en production (pg_default_acl) : ils sont repris explicitement
-- plus bas. Les fonctions tournent avec les droits du propriétaire (SECURITY
-- DEFINER, search_path vide) et vérifient elles-mêmes l'entreprise, le rôle et
-- le destinataire. Pas de policy « support_read » : lecture strictement limitée
-- à l'entreprise (même choix que le lot 2).
--
-- Tant que cette migration n'est pas appliquée, l'application se comporte
-- EXACTEMENT comme avant : la lecture échoue en silence (PGRST205 / PGRST202)
-- et aucun « Formations » n'apparaît, ni au bureau ni chez le salarié.

-- ── 1) Les formations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trainings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  kind         text NOT NULL CHECK (kind IN ('video', 'document')),
  video_url    text CHECK (video_url IS NULL OR (length(video_url) <= 500 AND video_url ~ '^https://(www\.youtube\.com|m\.youtube\.com|youtube\.com|youtu\.be|vimeo\.com|www\.vimeo\.com|player\.vimeo\.com|drive\.google\.com|docs\.google\.com)/[^[:space:]<>"\\]*$')),
  -- SET NULL : retirer un document de « Documents » reste possible ; la
  -- formation montre alors « document retiré » au bureau et disparaît chez le
  -- salarié (my_trainings).
  document_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  -- « Toute l'équipe » : chaque salarié actif ou chef d'équipe de l'entreprise,
  -- y compris un nouveau venu. Sinon : la liste assignee_ids.
  all_team     boolean NOT NULL DEFAULT true,
  assignee_ids uuid[] NOT NULL DEFAULT '{}',
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  CONSTRAINT trainings_source CHECK (
    (kind = 'video' AND video_url IS NOT NULL AND document_id IS NULL)
    OR (kind = 'document' AND video_url IS NULL)),
  CONSTRAINT trainings_audience CHECK (
    (all_team AND cardinality(assignee_ids) = 0)
    OR (NOT all_team AND cardinality(assignee_ids) BETWEEN 1 AND 500))
);
CREATE INDEX IF NOT EXISTS trainings_company_idx  ON public.trainings (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trainings_document_idx ON public.trainings (document_id) WHERE document_id IS NOT NULL;
COMMENT ON TABLE public.trainings IS
  'Formations (lot 6) : lien YouTube / Vimeo / Google Drive, ou document déjà téléversé, pour toute l''équipe (all_team) ou des salariés choisis (assignee_ids). Lue et écrite par le bureau ; le salarié passe par my_trainings(). Jamais effacée : archived_at.';

-- ── 2) « Vue » ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_views (
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  -- CASCADE : « Supprimer » un salarié (fiche salarié) n'échoue pas à cause d'une « Vue ».
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (training_id, user_id)
);
CREATE INDEX IF NOT EXISTS training_views_company_idx ON public.training_views (company_id, training_id);
CREATE INDEX IF NOT EXISTS training_views_user_idx    ON public.training_views (user_id);
COMMENT ON TABLE public.training_views IS
  'Formations (lot 6) : un salarié a coché « Vue ». Écrite UNIQUEMENT par set_training_seen() (date du serveur). Lue par le bureau (entreprise) et par le salarié (les siennes).';

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trainings, public.training_views FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trainings TO authenticated;
-- Droits PAR COLONNE : ni id, ni created_by, ni created_at, ni archived_at à
-- l'insertion ; ni company_id, ni created_by, ni created_at en modification.
GRANT INSERT (company_id, title, kind, video_url, document_id, all_team, assignee_ids) ON public.trainings TO authenticated;
GRANT UPDATE (title, kind, video_url, document_id, all_team, assignee_ids, archived_at) ON public.trainings TO authenticated;
GRANT SELECT ON public.training_views TO authenticated;
GRANT ALL ON public.trainings, public.training_views TO service_role;

-- Le bureau, et SEULEMENT son entreprise.
DROP POLICY IF EXISTS trainings_office_select ON public.trainings;
CREATE POLICY trainings_office_select ON public.trainings FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());
DROP POLICY IF EXISTS trainings_office_insert ON public.trainings;
CREATE POLICY trainings_office_insert ON public.trainings FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());
DROP POLICY IF EXISTS trainings_office_update ON public.trainings;
CREATE POLICY trainings_office_update ON public.trainings FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());
-- Aucune policy DELETE : une formation se retire (archived_at), elle ne s'efface pas.

DROP POLICY IF EXISTS training_views_select ON public.training_views;
CREATE POLICY training_views_select ON public.training_views FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));
-- Aucune policy INSERT / UPDATE / DELETE : set_training_seen() seule écrit.

-- ── 3) Garde d'écriture des formations ─────────────────────────────────────
-- Le propriétaire de la ligne ne change jamais ; un document vient de
-- l'entreprise ; les destinataires sont des salariés ACTIFS de l'entreprise
-- (salarié ou chef d'équipe). Ne vérifie que ce qui CHANGE : la suppression
-- d'un document (ON DELETE SET NULL), d'un auteur (SET NULL) ou le retrait
-- d'une formation ne sont jamais bloqués par un salarié parti depuis.
CREATE OR REPLACE FUNCTION public.guard_training_write()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_added uuid[];
BEGIN
  new.title := btrim(new.title);
  IF TG_OP = 'INSERT' THEN
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.archived_at := NULL;
  ELSE
    new.company_id := old.company_id;
    -- NULL laissé passer : c'est ON DELETE SET NULL (auteur supprimé) — le
    -- navigateur, lui, n'a aucun droit sur la colonne.
    IF new.created_by IS NOT NULL THEN new.created_by := old.created_by; END IF;
    new.created_at := old.created_at;
    -- « Retirer » : l'heure du serveur ; déjà retirée : l'heure d'origine reste.
    IF new.archived_at IS NOT NULL THEN new.archived_at := coalesce(old.archived_at, now()); END IF;
  END IF;

  IF new.kind = 'document' AND new.document_id IS NULL
     AND (TG_OP = 'INSERT' OR old.kind IS DISTINCT FROM 'document') THEN
    RAISE EXCEPTION 'Choisissez un document.' USING ERRCODE = '22023';
  END IF;
  IF new.document_id IS NOT NULL AND (TG_OP = 'INSERT' OR new.document_id IS DISTINCT FROM old.document_id)
     AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = new.document_id AND d.company_id = new.company_id) THEN
    RAISE EXCEPTION 'Document introuvable dans votre entreprise.' USING ERRCODE = '42501';
  END IF;

  IF new.all_team THEN
    new.assignee_ids := '{}';
  ELSE
    new.assignee_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(new.assignee_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL ORDER BY x);
    IF cardinality(new.assignee_ids) = 0 THEN
      RAISE EXCEPTION 'Choisissez au moins un salarié.' USING ERRCODE = '22023';
    END IF;
    v_added := CASE WHEN TG_OP = 'INSERT' OR old.all_team THEN new.assignee_ids
                    ELSE ARRAY(SELECT x FROM unnest(new.assignee_ids) AS x WHERE NOT (x = ANY (old.assignee_ids))) END;
    IF EXISTS (SELECT 1 FROM unnest(v_added) AS a(id)
                WHERE NOT EXISTS (SELECT 1 FROM public.users u
                                   WHERE u.id = a.id AND u.company_id = new.company_id
                                     AND u.is_active IS DISTINCT FROM false
                                     AND u.role::text IN ('worker', 'lead'))) THEN
      RAISE EXCEPTION 'Salarié introuvable dans votre entreprise.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN new;
END $fn$;
DROP TRIGGER IF EXISTS trainings_guard_write ON public.trainings;
CREATE TRIGGER trainings_guard_write BEFORE INSERT OR UPDATE ON public.trainings
  FOR EACH ROW EXECUTE FUNCTION public.guard_training_write();

-- ── 4) Mes formations (salarié, chef d'équipe) ─────────────────────────────
-- Ce qui m'est destiné, pas retiré, de MON entreprise ; un document retiré
-- n'est plus proposé. Ni la liste des destinataires, ni les « Vue » des autres.
-- Un compte bureau n'a pas de formations (rien n'est rendu).
CREATE OR REPLACE FUNCTION public.my_trainings()
 RETURNS TABLE (id uuid, title text, kind text, video_url text,
                document_name text, document_path text, document_mime text,
                created_at timestamptz, seen_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  SELECT t.id, t.title, t.kind, t.video_url,
         CASE WHEN d.id IS NOT NULL THEN coalesce(nullif(btrim(d.label), ''), d.file_name, 'Document') END,
         d.file_path, d.mime_type, t.created_at, v.seen_at
    FROM public.trainings t
    LEFT JOIN public.documents d ON d.id = t.document_id AND d.company_id = t.company_id
    LEFT JOIN public.training_views v ON v.training_id = t.id AND v.user_id = auth.uid()
   WHERE auth.uid() IS NOT NULL
     AND t.company_id = public.get_my_company_id()
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text IN ('worker', 'lead'))
     AND t.archived_at IS NULL
     AND (t.all_team OR auth.uid() = ANY (t.assignee_ids))
     AND (t.kind = 'video' OR d.id IS NOT NULL)
   ORDER BY (v.seen_at IS NOT NULL), t.created_at DESC
   LIMIT 200
$fn$;

-- ── 5) « Vue » / « Annuler » ───────────────────────────────────────────────
-- p_seen vrai : pose « Vue » (une fois ; un second appel rend la même date).
-- p_seen faux : « Annuler » — sa propre ligne, 10 minutes au plus après.
CREATE OR REPLACE FUNCTION public.set_training_seen(p_training uuid, p_seen boolean DEFAULT true)
 RETURNS timestamptz
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_co uuid := public.get_my_company_id();
  v_at timestamptz;
BEGIN
  IF v_me IS NULL OR v_co IS NULL THEN
    RAISE EXCEPTION 'Session invalide.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.role::text IN ('worker', 'lead')) THEN
    RAISE EXCEPTION 'Réservé aux salariés.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainings t
                  WHERE t.id = p_training AND t.company_id = v_co AND t.archived_at IS NULL
                    AND (t.all_team OR v_me = ANY (t.assignee_ids))) THEN
    RAISE EXCEPTION 'Cette formation n''existe pas, ou ne vous est pas destinée.' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(p_seen, true) THEN
    INSERT INTO public.training_views (training_id, user_id, company_id)
    VALUES (p_training, v_me, v_co)
    ON CONFLICT (training_id, user_id) DO NOTHING;
    SELECT v.seen_at INTO v_at FROM public.training_views v
     WHERE v.training_id = p_training AND v.user_id = v_me;
    RETURN v_at;
  END IF;
  -- « Annuler » : SA ligne, 10 minutes au plus (le seul effacement du lot).
  DELETE FROM public.training_views v
   WHERE v.training_id = p_training AND v.user_id = v_me AND v.seen_at > now() - interval '10 minutes';
  IF NOT FOUND AND EXISTS (SELECT 1 FROM public.training_views v
                            WHERE v.training_id = p_training AND v.user_id = v_me) THEN
    RAISE EXCEPTION 'Trop tard pour annuler : « Vue » est enregistrée.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $fn$;

-- ── 6) Droits des fonctions (repris explicitement : voir « DROITS ») ───────
REVOKE ALL ON FUNCTION public.guard_training_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_trainings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_training_seen(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_trainings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_training_seen(uuid, boolean) TO authenticated;

-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne de résultat, toutes
-- les colonnes à true (le test l'exécute telle quelle).
-- SELECT
--   (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trainings') = 'trainings_office_insert:INSERT,trainings_office_select:SELECT,trainings_office_update:UPDATE' AS v1_formations_3_policies_sans_delete,
--   (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_views') = 'training_views_select:SELECT' AS v2_vues_lecture_seule,
--   (SELECT bool_and(c.relrowsecurity) FROM pg_class c WHERE c.oid IN ('public.trainings'::regclass, 'public.training_views'::regclass)) AS v3_rls_active,
--   NOT has_any_column_privilege('anon', 'public.trainings', 'SELECT,INSERT,UPDATE') AND NOT has_any_column_privilege('anon', 'public.training_views', 'SELECT,INSERT,UPDATE') AND NOT has_table_privilege('anon', 'public.trainings', 'DELETE,TRUNCATE') AND NOT has_table_privilege('anon', 'public.training_views', 'DELETE,TRUNCATE') AS v4_anon_rien,
--   NOT has_table_privilege('authenticated', 'public.trainings', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('authenticated', 'public.training_views', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v5_ni_delete_ni_truncate,
--   has_column_privilege('authenticated', 'public.trainings', 'title', 'INSERT') AND NOT has_column_privilege('authenticated', 'public.trainings', 'id', 'INSERT') AND NOT has_column_privilege('authenticated', 'public.trainings', 'created_by', 'INSERT') AND NOT has_column_privilege('authenticated', 'public.trainings', 'archived_at', 'INSERT') AND has_column_privilege('authenticated', 'public.trainings', 'archived_at', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.trainings', 'created_by', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.trainings', 'company_id', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.trainings', 'created_at', 'UPDATE') AS v6_droits_par_colonne,
--   has_table_privilege('authenticated', 'public.training_views', 'SELECT') AND NOT has_any_column_privilege('authenticated', 'public.training_views', 'INSERT,UPDATE') AS v7_vues_par_fonction_seulement,
--   NOT has_function_privilege('anon', 'public.my_trainings()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.set_training_seen(uuid, boolean)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.my_trainings()', 'EXECUTE') AND has_function_privilege('authenticated', 'public.set_training_seen(uuid, boolean)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.guard_training_write()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.guard_training_write()', 'EXECUTE') AS v8_fonctions_sans_anon,
--   (SELECT count(*) = 3 AND bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('guard_training_write', 'my_trainings', 'set_training_seen')) AS v9_definer_search_path_vide,
--   (SELECT string_agg(tgname, ',') FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.trainings'::regclass, 'public.training_views'::regclass)) = 'trainings_guard_write' AS v10_un_seul_trigger;

-- RETOUR ARRIÈRE — rien d'existant n'a été remplacé : on retire ce qui a été
-- ajouté. ⚠ Efface les formations et leurs « Vue ». Les documents, les heures,
-- le planning et tout le reste ne bougent pas. Pour l'exécuter : copier les
-- lignes ENTRE « DÉBUT » et « FIN » en retirant au début de chaque ligne « -- »
-- ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP FUNCTION IF EXISTS public.set_training_seen(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.my_trainings();
-- DROP TABLE IF EXISTS public.training_views;
-- DROP TABLE IF EXISTS public.trainings;  -- emporte son trigger trainings_guard_write
-- DROP FUNCTION IF EXISTS public.guard_training_write();
-- ── FIN DU RETOUR ARRIÈRE ──
