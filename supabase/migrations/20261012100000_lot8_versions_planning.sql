-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 8 (oct. 2026) — VERSIONS DU PLANNING, RETOUR EN UN CLIC
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin) : les versions cessent d'être
-- lues et écrites par l'appli (l'entrée « Versions » se cache d'elle-même,
-- l'assistant n'en écrit plus) ; la table et les versions déjà gardées RESTENT
-- (rien n'est effacé). Rejouable, même si le fichier n'a jamais été appliqué.
--   DO $rb$
--   BEGIN
--     IF to_regclass('public.planning_versions') IS NOT NULL THEN
--       REVOKE ALL ON public.planning_versions FROM anon, authenticated;
--       DROP POLICY IF EXISTS planning_versions_select_office ON public.planning_versions;
--       DROP POLICY IF EXISTS planning_versions_insert_office ON public.planning_versions;
--       DROP TRIGGER IF EXISTS planning_versions_numero ON public.planning_versions;
--     END IF;
--   END $rb$;
--   DROP FUNCTION IF EXISTS public.planning_versions_numero();
--
-- Pour retirer AUSSI la table (⚠ efface toutes les versions gardées), en plus, à
-- part, seulement si on est sûr : DROP TABLE IF EXISTS public.planning_versions;
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 10 × true (aussi
-- plus tard, une fois des versions gardées) :
--   SELECT
--     (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.planning_versions'::regclass) AS v1_rls_active,
--     (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies
--       WHERE schemaname = 'public' AND tablename = 'planning_versions')
--       = 'planning_versions_insert_office:INSERT,planning_versions_select_office:SELECT'      AS v2_lecture_et_ajout_seulement,
--     NOT has_table_privilege('anon', 'public.planning_versions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
--     AND NOT has_any_column_privilege('anon', 'public.planning_versions', 'SELECT,INSERT,UPDATE,REFERENCES') AS v3_anon_rien,
--     has_table_privilege('authenticated', 'public.planning_versions', 'SELECT')
--     AND NOT has_table_privilege('authenticated', 'public.planning_versions', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
--     AND NOT has_any_column_privilege('authenticated', 'public.planning_versions', 'UPDATE,REFERENCES') AS v4_ni_modifier_ni_effacer,
--     (SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns
--       WHERE table_schema = 'public' AND table_name = 'planning_versions'
--         AND has_column_privilege('authenticated', 'public.planning_versions', column_name, 'INSERT'))
--       = 'cells,company_id,kind,note,request,user_ids,week_start'                             AS v5_colonnes_ajoutables,
--     NOT has_table_privilege('service_role', 'public.planning_versions', 'INSERT,UPDATE,DELETE,TRUNCATE') AS v6_pas_de_cle_de_service,
--     (SELECT p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""'
--        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
--      FROM pg_proc p WHERE p.oid = 'public.planning_versions_numero()'::regprocedure)      AS v7_fonction_fermee,
--     EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.planning_versions'::regclass
--             AND tgname = 'planning_versions_numero' AND NOT tgisinternal AND tgenabled = 'O')  AS v8_declencheur,
--     (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'planning_versions'
--       AND indexname IN ('planning_versions_semaine_idx', 'planning_versions_date_idx')) = 2 AS v9_index,
--     (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.planning_versions'::regclass AND contype = 'c'
--       AND conname IN ('planning_versions_lundi', 'planning_versions_kind', 'planning_versions_request',
--                       'planning_versions_note', 'planning_versions_cells', 'planning_versions_users')) = 6 AS v10_controles;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261012100000', 'lot8_versions_planning') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : garder « l'historique des plannings de l'assistant avec retour en
-- arrière en un clic ». Quand l'assistant change le planning d'une semaine en
-- bloc (planning_semaine, effacer_planning), on garde des versions numérotées :
-- V1 « initiale » (avant le premier changement de l'assistant sur la semaine),
-- puis chaque essai, avec la date, l'auteur et la demande. Le bureau peut aussi
-- « Garder cette version » à la main.
--
-- CE QUE FAIT LE FICHIER : une table neuve `planning_versions` (une ligne = une
-- version d'une semaine, lundi → dimanche, de toute l'entreprise) :
--   · `cells` : la copie des cases de travail de la semaine (pas les absences,
--     jamais d'heures) — identifiant, salarié, chantier, jour, heures prévues,
--     note, auteur de la case ;
--   · `request` : la demande faite à l'assistant (500 caractères au plus). D5 :
--     c'est le SEUL endroit où le texte d'une demande est gardé ; réservé au
--     bureau ; gardé 12 mois (la purge viendra à part : ici, aucune suppression) ;
--   · `number` (n° de version), `created_by`, `created_at` : posés par la base
--     (déclencheur), jamais par l'appli.
--
-- QUI : le BUREAU de l'entreprise (is_admin) lit et ajoute. Personne ne modifie
-- ni n'efface une version (aucune policy UPDATE ni DELETE, aucun droit UPDATE,
-- DELETE ou TRUNCATE, même pas la clé de service). Le salarié et le chef
-- d'équipe ne voient rien (pas même les demandes). anon : rien.
--
-- RESTAURER N'EST PAS UNE FONCTION SQL : « Revenir à cette version » se fait
-- dans le navigateur, avec les droits du bureau connecté et les écritures
-- existantes du planning (lib/planning-versions.ts, qui réutilise lib/erase.ts
-- et lib/admin-writes.ts) : l'état actuel est d'abord gardé comme nouvelle
-- version, puis seules les CASES du planning sont remises. Les cases qui portent
-- des heures, celles d'un mois clôturé, celles avec un pointage en cours et celles
-- ajoutées par le salarié sont gardées (et c'est dit). Les traces du lot 3 notent
-- chaque case touchée (origine « écran », ou « assistant »).
--
-- PAS DE CLÉ ÉTRANGÈRE (comme `traces`) : une version n'empêche aucune suppression
-- d'entreprise et reste de l'historique jusqu'à la purge à 12 mois (à venir).
--
-- 100 % ADDITIVE : une table neuve, une fonction neuve (déclencheur), un
-- déclencheur neuf, deux index neufs. Aucune table, colonne, policy, fonction ou
-- déclencheur existant n'est modifié ; aucune donnée existante n'est lue ni
-- réécrite. Les droits par défaut du schéma (tout pour anon et authenticated
-- sur un objet neuf) sont RETIRÉS sur la table et la fonction neuves, puis on
-- donne seulement ce qu'il faut. Rejouable (IF NOT EXISTS, OR REPLACE,
-- policies et déclencheur posés seulement s'ils manquent).
--
-- À SAVOIR (règle « DROP ou DELETE ») : DROP n'apparaît que dans le RETOUR
-- ARRIÈRE ci-dessus. DELETE n'apparaît nulle part en instruction (seulement dans
-- les commentaires, dont la vérification). Aucune purge ici.
--
-- AVANT APPLICATION : l'application fonctionne exactement comme aujourd'hui.
-- Elle lit une fois `planning_versions` ; la table absente (PGRST205), l'entrée
-- « Versions » reste cachée et l'assistant n'écrit aucune version.
--
-- Testée sur un Postgres jetable : npm run test:versions-db
-- (supabase/tests/lot8_versions_planning.mjs).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.planning_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  -- Le lundi de la semaine (lundi → dimanche, comme lib/week.ts).
  week_start  date NOT NULL,
  -- N° de version dans la semaine (1, 2, 3…) : posé par le déclencheur.
  number      integer NOT NULL,
  -- initial : V1, avant le premier changement de l'assistant ; assistant : un essai ;
  -- manuel : « Garder cette version » ; avant_assistant : changements faits à la main
  -- depuis la dernière version, gardés avant un nouvel essai ; avant_retour : l'état
  -- gardé juste avant un retour en arrière (« Annuler » y revient).
  kind        text NOT NULL,
  -- La demande faite à l'assistant (seulement pour un essai). D5 : bureau, 12 mois.
  request     text,
  note        text,
  -- La copie des cases de travail de la semaine (tableau JSON).
  cells       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Les salariés présents dans la copie.
  user_ids    uuid[] NOT NULL DEFAULT '{}',
  -- Qui (auth.uid() ; NULL = système) et quand : posés par le déclencheur.
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_versions_lundi CHECK (extract(isodow FROM week_start) = 1),
  CONSTRAINT planning_versions_kind CHECK (kind IN ('initial', 'assistant', 'manuel', 'avant_assistant', 'avant_retour')),
  CONSTRAINT planning_versions_request CHECK (request IS NULL OR (kind = 'assistant' AND char_length(request) <= 500)),
  CONSTRAINT planning_versions_note CHECK (note IS NULL OR char_length(note) <= 200),
  CONSTRAINT planning_versions_cells CHECK (jsonb_typeof(cells) = 'array' AND jsonb_array_length(cells) <= 2000),
  CONSTRAINT planning_versions_users CHECK (cardinality(user_ids) <= 1000)
);

COMMENT ON TABLE public.planning_versions IS
  'Lot 8 : versions du planning d''une semaine (cases de travail seulement, jamais d''heures). Bureau : lecture et ajout ; personne ne modifie ni n''efface. Demandes gardées 12 mois (D5), purge à part.';

-- Les versions d'une semaine, dans l'ordre (et un seul n° par semaine).
CREATE UNIQUE INDEX IF NOT EXISTS planning_versions_semaine_idx ON public.planning_versions (company_id, week_start, number);
-- Pour la purge à 12 mois (à venir, à part).
CREATE INDEX IF NOT EXISTS planning_versions_date_idx ON public.planning_versions (company_id, created_at);

-- N°, auteur et date posés par la base : l'appli ne peut ni les choisir ni les
-- falsifier. Un verrou par entreprise et semaine : deux ajouts en même temps
-- prennent deux numéros différents.
CREATE OR REPLACE FUNCTION public.planning_versions_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('planning_versions|' || new.company_id::text || '|' || new.week_start::text, 0));
  new.number := coalesce((SELECT max(v.number) FROM public.planning_versions v
                           WHERE v.company_id = new.company_id AND v.week_start = new.week_start), 0) + 1;
  new.created_by := auth.uid();
  new.created_at := pg_catalog.now();
  RETURN new;
END
$fn$;
REVOKE ALL ON FUNCTION public.planning_versions_numero() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.planning_versions'::regclass
                  AND tgname = 'planning_versions_numero' AND NOT tgisinternal) THEN
    CREATE TRIGGER planning_versions_numero BEFORE INSERT ON public.planning_versions
      FOR EACH ROW EXECUTE FUNCTION public.planning_versions_numero();
  END IF;
END $do$;

ALTER TABLE public.planning_versions ENABLE ROW LEVEL SECURITY;

-- Le bureau de l'entreprise : lire et ajouter. Rien d'autre (ni UPDATE, ni DELETE).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'planning_versions'
                  AND policyname = 'planning_versions_select_office') THEN
    CREATE POLICY planning_versions_select_office ON public.planning_versions FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() AND public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'planning_versions'
                  AND policyname = 'planning_versions_insert_office') THEN
    CREATE POLICY planning_versions_insert_office ON public.planning_versions FOR INSERT TO authenticated
      WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());
  END IF;
END $do$;

-- Droits : on retire ceux donnés par défaut aux objets neufs, puis on donne la
-- lecture et l'ajout (colonnes choisies : ni id, ni n°, ni auteur, ni date).
REVOKE ALL ON public.planning_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.planning_versions TO authenticated;
GRANT INSERT (company_id, week_start, kind, request, note, cells, user_ids) ON public.planning_versions TO authenticated;
