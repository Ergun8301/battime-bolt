-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 13 (oct. 2026) — VIDÉOS DE FORMATION : ENVOI DIRECT (forfait gratuit)
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE — rien d'existant n'a été remplacé : on retire ce qui a été
-- ajouté. ⚠ Efface les vidéos de formation (leurs lignes) et leurs « Vue ». Les
-- FICHIERS restent dans le bucket « formations » (une suppression de fichier se
-- fait par l'API de stockage, jamais en SQL) : le bucket et ses fichiers ne se
-- retirent qu'avec l'accord d'Ergun, depuis le tableau de bord (Storage →
-- formations). Les formations du lot 6, les documents, les heures et le reste
-- ne bougent pas. Copier les lignes ENTRE « DÉBUT » et « FIN » en retirant au
-- début de chaque ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP POLICY IF EXISTS formations_office_insert ON storage.objects;
-- DROP POLICY IF EXISTS formations_read ON storage.objects;
-- DROP FUNCTION IF EXISTS public.set_training_video_seen(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.my_training_videos();
-- DROP FUNCTION IF EXISTS public.training_video_leftovers();
-- DROP FUNCTION IF EXISTS public.set_training_video_archived(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.publish_training_video(uuid);
-- DROP FUNCTION IF EXISTS public.start_training_video(text, boolean, uuid[], text, bigint, integer);
-- DROP FUNCTION IF EXISTS public.training_video_limits();
-- DROP FUNCTION IF EXISTS public.training_video_readable(text);
-- DROP FUNCTION IF EXISTS public.training_video_upload_ok(text);
-- DROP FUNCTION IF EXISTS public.training_video_usage(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.training_video_max_bytes();
-- DROP FUNCTION IF EXISTS public.training_video_quota_bytes();
-- DROP TABLE IF EXISTS public.training_video_views;
-- DROP TABLE IF EXISTS public.training_videos;
-- ── FIN DU RETOUR ARRIÈRE ──
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 11 colonnes à
-- true (le test l'exécute telle quelle).
-- ── DÉBUT DE LA VÉRIFICATION ──
-- SELECT
--   EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = 'formations' AND NOT b.public AND b.file_size_limit = 52428800 AND b.allowed_mime_types::text[] = ARRAY['video/mp4', 'video/quicktime', 'video/webm']) AS v1_bucket_prive_50_mo_videos,
--   (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'formations%') = 'formations_office_insert:INSERT,formations_read:SELECT' AS v2_stockage_ni_update_ni_delete,
--   (SELECT string_agg(tablename || '.' || policyname || ':' || cmd, ',' ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('training_videos', 'training_video_views')) = 'training_video_views.training_video_views_select:SELECT,training_videos.training_videos_office_select:SELECT' AS v3_tables_lecture_seule,
--   (SELECT bool_and(c.relrowsecurity) FROM pg_class c WHERE c.oid IN ('public.training_videos'::regclass, 'public.training_video_views'::regclass)) AS v4_rls_active,
--   NOT has_any_column_privilege('anon', 'public.training_videos', 'SELECT,INSERT,UPDATE') AND NOT has_any_column_privilege('anon', 'public.training_video_views', 'SELECT,INSERT,UPDATE') AND NOT has_table_privilege('anon', 'public.training_videos', 'DELETE,TRUNCATE') AND NOT has_table_privilege('anon', 'public.training_video_views', 'DELETE,TRUNCATE') AS v5_anon_rien,
--   has_table_privilege('authenticated', 'public.training_videos', 'SELECT') AND NOT has_any_column_privilege('authenticated', 'public.training_videos', 'INSERT,UPDATE') AND NOT has_any_column_privilege('authenticated', 'public.training_video_views', 'INSERT,UPDATE') AND NOT has_table_privilege('authenticated', 'public.training_videos', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('authenticated', 'public.training_video_views', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v6_ecritures_par_fonctions_seulement,
--   (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%training_video%') AS v7_anon_aucune_fonction,
--   (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE') = (p.proname NOT IN ('training_video_usage', 'training_video_max_bytes', 'training_video_quota_bytes'))) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%training_video%') AS v8_fonctions_internes_fermees,
--   (SELECT count(*) = 12 AND bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%training_video%') AS v9_definer_search_path_vide,
--   (SELECT (r.rolsuper OR r.rolbypassrls) AND has_table_privilege(r.oid, 'storage.objects', 'SELECT') FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'training_video_usage') AS v10_quota_lit_la_vraie_taille,
--   NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.training_videos'::regclass, 'public.training_video_views'::regclass)) AS v11_aucun_trigger;
-- ── FIN DE LA VÉRIFICATION ──
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261011160000', 'lot13_videos_envoi_direct') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : Ergun veut que le bureau puisse filmer une consigne au téléphone
-- et l'envoyer tel quel, « 100 % gratuit, sans carte, jusqu'aux 5 premiers
-- clients » : Supabase Storage du forfait Free, déjà en place.
--
-- LIMITES DU FORFAIT GRATUIT (D8) — CE QUE LA BASE GARANTIT, ET CE QU'ELLE NE
-- PEUT PAS GARANTIR (dit tel quel, sans l'arrondir) :
--   · 50 Mo par fichier : bucket privé NEUF « formations », file_size_limit =
--     52428800, types vidéo seulement (MP4, MOV, WebM). Le stockage refuse
--     lui-même un fichier plus lourd ou d'un autre type. GARANTI.
--   · 100 Mo par entreprise, navigateur NORMAL (taille annoncée = taille
--     réelle) : GARANTI, jamais plus de 100 Mo. start_training_video compte la
--     VRAIE taille de tous les fichiers de l'entreprise (storage.objects) + la
--     taille ANNONCÉE de chaque place réservée dont le fichier n'est pas encore
--     arrivé, et refuse ce qui dépasse (verrou par entreprise).
--   · 100 Mo par entreprise, navigateur TRAFIQUÉ (un compte du bureau qui appelle
--     l'API à la main) : borne exacte = 100 Mo + 3 fichiers de 50 Mo au plus,
--     soit STRICTEMENT MOINS DE 250 Mo (50 Mo = limite du bucket).
--     Pourquoi on ne peut pas faire mieux sans service payant : le stockage ne
--     vérifie la policy d'envoi qu'à la CRÉATION de l'URL d'envoi signée ; le
--     fichier est ensuite écrit avec les droits du service, jusqu'à 2 h plus
--     tard, et la base ne voit sa taille qu'APRÈS son arrivée. Un navigateur
--     trafiqué peut donc annoncer 1 octet et envoyer 50 Mo, ou garder une URL
--     « écraser » signée avant l'arrivée du fichier et remplacer ensuite le
--     fichier. Ce qui borne le dégât :
--       1. une place = UN seul chemin = UN seul fichier à la fois (50 Mo au plus) ;
--       2. une place réservée compte sa taille annoncée jusqu'à l'arrivée du
--          fichier, ET RESTE COMPTÉE même si elle est « retirée » ou fermée :
--          retirer une place ne libère JAMAIS le quota (une vidéo non publiée ne
--          peut d'ailleurs pas être retirée) ;
--       3. un seul envoi ouvert à la fois par entreprise ;
--       4. au plus TROIS nouvelles places par tranche de 3 heures et par
--          entreprise (une URL signée vit 2 h, la demande doit se faire dans les
--          15 minutes : 3 h couvrent le tout). Passé ce délai, les URL signées
--          sont mortes et la vraie taille de tous les fichiers est comptée ;
--       5. la policy d'envoi refuse tout chemin qui n'est pas une place ouverte
--          de l'entreprise, ou dont le fichier existe déjà.
--     Ensuite plus rien ne part : la vraie taille est comptée à chaque demande.
--   · Une vidéo retirée garde son fichier (D12 : rien n'est supprimé sans
--     l'accord d'Ergun) : elle compte toujours dans les 100 Mo. Un fichier arrivé
--     dont la vidéo n'a jamais été publiée compte aussi : training_video_leftovers()
--     le montre au bureau (« Envoi non terminé »).
--
-- HYPOTHÈSES tirées de la documentation Supabase, NON TESTÉES sur le vrai
-- service (à vérifier à l'application) : la policy INSERT est vérifiée à la
-- création de l'URL signée (pas à l'envoi) ; l'URL vit 2 h ; la limite de taille
-- et les types du bucket sont appliqués à l'envoi ; le propriétaire des
-- fonctions (postgres) lit storage.objects (vérification v10). Si le stockage
-- refusait déjà une URL « écraser » sans policy UPDATE, la borne serait même
-- meilleure ; elle n'est jamais pire que celle écrite ici.
--
-- POURQUOI UN BUCKET ET UNE TABLE NEUFS (option B) plutôt que documents +
-- chantier-docs : dans chantier-docs, TOUT membre de l'entreprise écrit et
-- efface n'importe où dans le dossier de l'entreprise (policies d'origine) ; un
-- bucket n'a qu'une limite de taille ; documents.worksite_id est obligatoire ;
-- et les listes de documents se rempliraient de vidéos. La table des
-- formations du lot 6 n'est pas touchée (D10) : ses contraintes exigent un lien
-- YouTube / Vimeo / Drive ou un document — les élargir serait un DROP.
--
-- LE PARCOURS (bureau) : start_training_video (titre, public, type, taille) →
-- place réservée « {entreprise}/{uuid} » → le navigateur demande une URL
-- d'envoi signée (policy formations_office_insert : bureau, sa place, 15 min) →
-- envoi XHR avec barre de progression et « Annuler » → publish_training_video
-- lit la vraie taille et le vrai type dans storage.objects et publie. Un envoi
-- annulé ou coupé garde sa place : le suivant la reprend (jamais deux fichiers
-- pour une place). Le salarié : my_training_videos, lien signé de lecture à
-- l'ouverture (policy formations_read : le bureau, ou un salarié destinataire
-- d'une vidéo publiée et non retirée) ; « Vue » par set_training_video_seen.
--
-- 100 % ADDITIVE, AUCUN DROP NI DELETE EXÉCUTÉ : un bucket neuf, 2 tables
-- neuves, 12 fonctions neuves, 2 policies neuves sur storage.objects et 2 sur
-- les tables neuves (créées seulement si elles manquent). Aucune table,
-- colonne, contrainte, policy, fonction ou trigger existant n'est modifié ;
-- aucune donnée existante n'est touchée. Pas de policy UPDATE ni DELETE sur les
-- fichiers, et la policy d'envoi refuse un chemin dont le fichier existe déjà :
-- la base n'accorde jamais d'écrasement ni d'effacement. (Reste une limite du
-- stockage, dite plus haut : une URL « écraser » signée AVANT l'arrivée du
-- fichier ; elle est comptée dans la borne.) « Annuler » une « Vue » pose
-- undone_at (rien n'est effacé). Retirer une vidéo = archived_at + archived_by.
-- Rejouable : IF NOT EXISTS, OR REPLACE, ON CONFLICT DO NOTHING, policies dans
-- des blocs DO qui regardent pg_policies.
--
-- DROITS. Tout objet neuf reçoit par défaut TOUS les droits pour anon et
-- authenticated en production (pg_default_acl) : ils sont repris explicitement
-- plus bas. Les fonctions tournent avec les droits du propriétaire (SECURITY
-- DEFINER, search_path vide) et vérifient elles-mêmes l'entreprise, le rôle et
-- le destinataire. Pas de lecture « support » : strictement l'entreprise.
--
-- Tant que cette migration n'est pas appliquée, l'application se comporte
-- EXACTEMENT comme avant : la lecture échoue en silence (PGRST205 / PGRST202)
-- et l'option « Vidéo (téléphone ou fichier) » n'apparaît pas.
--
-- NE COMPTE JAMAIS COMME HEURES : rien ici n'écrit planning, time_entries ou
-- active_sessions.
--
-- Testée sur un Postgres jetable : npm run test:videos-db
-- (supabase/tests/lot13_videos_envoi_direct.mjs).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Le bucket privé « formations » ──────────────────────────────────────
-- 50 Mo et types vidéo, au niveau du bucket (le stockage refuse lui-même).
-- Rien n'est changé s'il existe déjà (la vérification relit ses réglages).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('formations', 'formations', false, 52428800, ARRAY['video/mp4', 'video/quicktime', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

-- ── 2) Les vidéos ──────────────────────────────────────────────────────────
-- Une ligne = une vidéo de formation ET sa place dans le bucket
-- (file_path = « {company_id}/{id} », sans extension : le type est gardé par
-- le stockage). published_at NULL = envoi pas terminé : invisible au salarié.
CREATE TABLE IF NOT EXISTS public.training_videos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  -- « Toute l'équipe » (nouveaux venus compris) ou la liste assignee_ids.
  all_team       boolean NOT NULL DEFAULT true,
  assignee_ids   uuid[] NOT NULL DEFAULT '{}',
  file_path      text NOT NULL UNIQUE,
  mime_type      text NOT NULL CHECK (mime_type IN ('video/mp4', 'video/quicktime', 'video/webm')),
  -- Taille annoncée par le navigateur : comptée dans le quota tant que l'envoi
  -- est en cours ; ensuite c'est la vraie taille (storage.objects) qui compte.
  declared_bytes bigint NOT NULL CHECK (declared_bytes > 0),
  -- Vraie taille, lue dans storage.objects à la publication.
  size_bytes     bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  duration_s     integer CHECK (duration_s IS NULL OR duration_s BETWEEN 0 AND 86400),
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Dernier envoi démarré sur cette place (l'URL signée se demande dans les 15 min).
  reserved_at    timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  -- « Retirer » : jamais effacée ; le fichier reste (D12).
  archived_at    timestamptz,
  archived_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT training_videos_audience CHECK (
    (all_team AND cardinality(assignee_ids) = 0)
    OR (NOT all_team AND cardinality(assignee_ids) BETWEEN 1 AND 500)),
  CONSTRAINT training_videos_path CHECK (file_path = company_id::text || '/' || id::text),
  CONSTRAINT training_videos_published CHECK (published_at IS NULL OR size_bytes IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS training_videos_company_idx ON public.training_videos (company_id, created_at DESC);
COMMENT ON TABLE public.training_videos IS
  'Vidéos de formation envoyées directement (lot 13), bucket privé « formations ». Écrite UNIQUEMENT par start_training_video / publish_training_video / set_training_video_archived ; lue par le bureau ; le salarié passe par my_training_videos(). Jamais effacée : archived_at.';

-- ── 3) « Vue » ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_video_views (
  video_id   uuid NOT NULL REFERENCES public.training_videos(id) ON DELETE CASCADE,
  -- CASCADE : « Supprimer » un salarié (fiche salarié) n'échoue pas à cause d'une « Vue » (comme le lot 6).
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seen_at    timestamptz NOT NULL DEFAULT now(),
  -- « Annuler » (10 minutes au plus) : la ligne reste, avec l'heure d'annulation.
  undone_at  timestamptz,
  PRIMARY KEY (video_id, user_id)
);
CREATE INDEX IF NOT EXISTS training_video_views_company_idx ON public.training_video_views (company_id, video_id);
CREATE INDEX IF NOT EXISTS training_video_views_user_idx    ON public.training_video_views (user_id);
COMMENT ON TABLE public.training_video_views IS
  'Vidéos de formation (lot 13) : un salarié a coché « Vue » (undone_at = annulée). Écrite UNIQUEMENT par set_training_video_seen() (heure du serveur). Lue par le bureau (entreprise) et par le salarié (les siennes).';

ALTER TABLE public.training_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_video_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_videos, public.training_video_views FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_videos, public.training_video_views TO authenticated;
GRANT ALL ON public.training_videos, public.training_video_views TO service_role;

-- Le bureau lit les vidéos de SON entreprise ; personne n'écrit directement.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_videos' AND policyname = 'training_videos_office_select') THEN
    CREATE POLICY training_videos_office_select ON public.training_videos FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() AND public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_video_views' AND policyname = 'training_video_views_select') THEN
    CREATE POLICY training_video_views_select ON public.training_video_views FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));
  END IF;
END $do$;

-- ── 4) Limites : UN seul endroit chacune ───────────────────────────────────
-- Quota par entreprise : 100 Mo (D8). Au passage au payant : remplacer
-- seulement cette fonction (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.training_video_quota_bytes()
 RETURNS bigint LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path TO ''
AS $fn$ SELECT 104857600::bigint $fn$;

-- Taille maximale d'un fichier : celle du bucket (52428800 = 50 Mo en gratuit).
CREATE OR REPLACE FUNCTION public.training_video_max_bytes()
 RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$ SELECT coalesce((SELECT b.file_size_limit::bigint FROM storage.buckets b WHERE b.id = 'formations'), 52428800::bigint) $fn$;

-- Place occupée par une entreprise :
--   stored_bytes   = VRAIE taille de tous ses fichiers du bucket (publiés,
--                    retirés ou jamais publiés : tout ce qui est stocké) ;
--   reserved_bytes = taille ANNONCÉE des places pas encore publiées, réservées
--                    il y a moins de 3 h (15 min pour demander l'URL signée +
--                    2 h de validité + marge) et dont le fichier n'est pas encore
--                    arrivé. Une place « retirée » ou fermée COMPTE TOUJOURS : tant
--                    qu'une URL signée peut être vivante, un fichier peut encore
--                    arriver ; retirer ne libère jamais le quota. Dès que le
--                    fichier est là, c'est sa vraie taille (stored_bytes) qui
--                    compte. p_except : la place que l'on va reprendre, pour ne
--                    pas la compter deux fois.
CREATE OR REPLACE FUNCTION public.training_video_usage(p_company uuid, p_except uuid DEFAULT NULL,
  OUT stored_bytes bigint, OUT reserved_bytes bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT
    coalesce((SELECT sum(coalesce(nullif(o.metadata->>'size', '')::bigint, 0)) FROM storage.objects o
               WHERE o.bucket_id = 'formations' AND o.name LIKE p_company::text || '/%'), 0)::bigint,
    coalesce((SELECT sum(v.declared_bytes) FROM public.training_videos v
               WHERE v.company_id = p_company AND v.id IS DISTINCT FROM p_except
                 AND v.published_at IS NULL
                 AND v.reserved_at > now() - interval '3 hours'
                 AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'formations' AND o.name = v.file_path)), 0)::bigint
$fn$;

-- ── 5) Policies du bucket (fonctions appelées par storage.objects) ─────────
-- Envoi : un compte bureau, sur SA place pas encore publiée ni retirée,
-- réservée il y a moins de 15 minutes, ET dont le fichier n'existe pas encore.
-- Rien d'autre : ni un salarié, ni une autre entreprise, ni un autre chemin, ni
-- une vidéo publiée, ni une place retirée, ni un chemin déjà occupé (donc ni
-- écrasement, ni « upsert » sur un fichier qui existe). Le stockage ne lance cette
-- vérification qu'à la création de l'URL signée : voir LIMITES, en tête de fichier.
CREATE OR REPLACE FUNCTION public.training_video_upload_ok(p_name text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT auth.uid() IS NOT NULL AND public.is_admin() AND EXISTS (
    SELECT 1 FROM public.training_videos v
     WHERE v.file_path = p_name AND v.company_id = public.get_my_company_id()
       AND v.created_by = auth.uid()
       AND v.published_at IS NULL AND v.archived_at IS NULL
       AND v.reserved_at > now() - interval '15 minutes')
    AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'formations' AND o.name = p_name)
$fn$;

-- Lecture (lien signé) : le bureau, dans le dossier de SON entreprise ; un
-- salarié ou chef d'équipe actif, si la vidéo est publiée, non retirée et lui
-- est destinée.
CREATE OR REPLACE FUNCTION public.training_video_readable(p_name text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT coalesce(auth.uid() IS NOT NULL AND split_part(p_name, '/', 1) = public.get_my_company_id()::text AND (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.training_videos v JOIN public.users u ON u.id = auth.uid()
                WHERE v.file_path = p_name AND v.company_id = u.company_id
                  AND u.role::text IN ('worker', 'lead') AND u.is_active IS DISTINCT FROM false
                  AND v.published_at IS NOT NULL AND v.archived_at IS NULL
                  AND (v.all_team OR auth.uid() = ANY (v.assignee_ids)))), false)
$fn$;

-- Pas de policy UPDATE (une mise à jour d'un fichier existant est refusée) ni
-- DELETE (D12).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'formations_office_insert') THEN
    CREATE POLICY formations_office_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'formations' AND public.training_video_upload_ok(name));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'formations_read') THEN
    CREATE POLICY formations_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'formations' AND public.training_video_readable(name));
  END IF;
END $do$;

-- ── 6) Bureau : la jauge « 23 Mo utilisés sur 100 Mo » ─────────────────────
CREATE OR REPLACE FUNCTION public.training_video_limits()
 RETURNS TABLE (max_file_bytes bigint, quota_bytes bigint, used_bytes bigint, reserved_bytes bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_co uuid := public.get_my_company_id();
  v_u record;
BEGIN
  IF auth.uid() IS NULL OR v_co IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau de l''entreprise.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_u FROM public.training_video_usage(v_co);
  RETURN QUERY SELECT public.training_video_max_bytes(), public.training_video_quota_bytes(), v_u.stored_bytes, v_u.reserved_bytes;
END $fn$;

-- ── 7) Bureau : réserver la place d'un envoi ───────────────────────────────
-- Contrôle le titre, le type, la taille, le public et le QUOTA (verrou par
-- entreprise : deux appels simultanés ne passent pas tous les deux). Rend la
-- place et `uploaded` = le fichier est déjà là (envoi terminé mais réseau coupé
-- avant la publication, même taille) : il n'y a plus qu'à publier.
CREATE OR REPLACE FUNCTION public.start_training_video(p_title text, p_all_team boolean, p_assignee_ids uuid[],
  p_mime text, p_size bigint, p_duration integer DEFAULT NULL)
 RETURNS TABLE (video_id uuid, video_path text, uploaded boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_co uuid := public.get_my_company_id();
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_all boolean := coalesce(p_all_team, true);
  v_ids uuid[] := '{}';
  v_dur integer := CASE WHEN p_duration BETWEEN 0 AND 86400 THEN p_duration END;
  v_max bigint := public.training_video_max_bytes();
  v_quota bigint := public.training_video_quota_bytes();
  v_slot_id uuid;
  v_slot_path text;
  v_reuse boolean := false;
  v_real bigint;
  v_u record;
  v_id uuid;
  v_recent integer;
  v_oldest timestamptz;
  v_wait integer;
BEGIN
  IF v_me IS NULL OR v_co IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau de l''entreprise.' USING ERRCODE = '42501';
  END IF;
  IF length(v_title) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Titre : 2 à 120 caractères.' USING ERRCODE = '22023';
  END IF;
  IF p_mime IS NULL OR p_mime NOT IN ('video/mp4', 'video/quicktime', 'video/webm') THEN
    RAISE EXCEPTION 'Format refusé : une vidéo MP4, MOV ou WebM.' USING ERRCODE = '22023';
  END IF;
  IF p_size IS NULL OR p_size <= 0 THEN
    RAISE EXCEPTION 'Ce fichier est vide.' USING ERRCODE = '22023';
  END IF;
  IF p_size > v_max THEN
    RAISE EXCEPTION 'Vidéo trop lourde : % Mo maximum.', v_max / 1048576 USING ERRCODE = '22023';
  END IF;
  IF NOT v_all THEN
    v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_assignee_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL ORDER BY x);
    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'Choisissez au moins un salarié.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) AS a(id)
                WHERE NOT EXISTS (SELECT 1 FROM public.users u
                                   WHERE u.id = a.id AND u.company_id = v_co
                                     AND u.is_active IS DISTINCT FROM false
                                     AND u.role::text IN ('worker', 'lead'))) THEN
      RAISE EXCEPTION 'Salarié introuvable dans votre entreprise.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Un appel à la fois par entreprise (jusqu'à la fin de la transaction).
  PERFORM pg_advisory_xact_lock(hashtext('bemexo.training_videos'), hashtext(v_co::text));

  -- Un SEUL envoi ouvert par entreprise : celui d'un AUTRE compte du bureau bloque
  -- (retiré ou non : une place sans fichier peut encore en recevoir un, 3 h).
  IF EXISTS (SELECT 1 FROM public.training_videos v
              WHERE v.company_id = v_co AND v.created_by IS DISTINCT FROM v_me
                AND v.published_at IS NULL
                AND v.reserved_at > now() - interval '3 hours'
                AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'formations' AND o.name = v.file_path)) THEN
    RAISE EXCEPTION 'Une autre vidéo est en cours d''envoi dans votre entreprise. Réessayez dans quelques minutes.' USING ERRCODE = 'P0001';
  END IF;

  -- Mon envoi précédent, jamais publié (annulé, coupé…) : on reprend SA place.
  SELECT v.id, v.file_path INTO v_slot_id, v_slot_path FROM public.training_videos v
   WHERE v.company_id = v_co AND v.created_by = v_me AND v.published_at IS NULL AND v.archived_at IS NULL
   ORDER BY v.reserved_at DESC LIMIT 1;
  IF FOUND THEN
    v_reuse := true;
    SELECT coalesce(nullif(o.metadata->>'size', '')::bigint, 0) INTO v_real
      FROM storage.objects o WHERE o.bucket_id = 'formations' AND o.name = v_slot_path;
    IF v_real IS NOT NULL AND v_real = p_size THEN
      -- Déjà arrivé, même taille : c'est ce fichier-là, il reste à le publier.
      UPDATE public.training_videos v
         SET title = v_title, all_team = v_all, assignee_ids = v_ids, mime_type = p_mime,
             declared_bytes = p_size, duration_s = coalesce(v_dur, v.duration_s), reserved_at = now()
       WHERE v.id = v_slot_id;
      RETURN QUERY SELECT v_slot_id, v_slot_path, true;
      RETURN;
    ELSIF v_real IS NOT NULL THEN
      -- Un AUTRE fichier est déjà arrivé à cette place : il reste (rien n'est
      -- effacé, il compte dans le quota) ; la place est fermée, avec une trace.
      UPDATE public.training_videos v SET archived_at = now(), archived_by = v_me WHERE v.id = v_slot_id;
      v_reuse := false;
    END IF;
  END IF;

  SELECT * INTO v_u FROM public.training_video_usage(v_co, CASE WHEN v_reuse THEN v_slot_id END);
  IF v_u.stored_bytes + v_u.reserved_bytes + p_size > v_quota THEN
    RAISE EXCEPTION 'Plus assez de place pour cette vidéo : % Mo utilisés sur % Mo.',
      round((v_u.stored_bytes + v_u.reserved_bytes) / 1048576.0), v_quota / 1048576 USING ERRCODE = 'P0001';
  END IF;

  IF v_reuse THEN
    UPDATE public.training_videos v
       SET title = v_title, all_team = v_all, assignee_ids = v_ids, mime_type = p_mime,
           declared_bytes = p_size, duration_s = v_dur, reserved_at = now()
     WHERE v.id = v_slot_id;
    RETURN QUERY SELECT v_slot_id, v_slot_path, false;
    RETURN;
  END IF;
  -- Au plus TROIS nouvelles places par tranche de 3 h et par entreprise (voir
  -- LIMITES, en tête de fichier) : une place reprise ne compte pas deux fois.
  SELECT count(*), min(r.reserved_at) INTO v_recent, v_oldest FROM (
    SELECT v.reserved_at FROM public.training_videos v
     WHERE v.company_id = v_co AND v.reserved_at > now() - interval '3 hours'
     ORDER BY v.reserved_at DESC LIMIT 3) r;
  IF v_recent >= 3 THEN
    v_wait := greatest(1, ceil(extract(epoch FROM (v_oldest + interval '3 hours' - now())) / 60.0)::integer);
    RAISE EXCEPTION 'Déjà trois envois de vidéo préparés ces 3 dernières heures dans votre entreprise. Réessayez dans environ %.',
      CASE WHEN v_wait < 60 THEN v_wait || ' min' WHEN v_wait % 60 = 0 THEN (v_wait / 60) || ' h'
           ELSE (v_wait / 60) || ' h ' || lpad((v_wait % 60)::text, 2, '0') END USING ERRCODE = 'P0001';
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO public.training_videos (id, company_id, title, all_team, assignee_ids, file_path, mime_type, declared_bytes, duration_s, created_by)
  VALUES (v_id, v_co, v_title, v_all, v_ids, v_co::text || '/' || v_id::text, p_mime, p_size, v_dur, v_me);
  RETURN QUERY SELECT v_id, v_co::text || '/' || v_id::text, false;
END $fn$;

-- ── 8) Bureau : publier une fois le fichier arrivé ─────────────────────────
-- La taille et le type viennent du STOCKAGE (storage.objects), jamais du
-- navigateur. Une seconde publication rend la même ligne.
CREATE OR REPLACE FUNCTION public.publish_training_video(p_id uuid)
 RETURNS TABLE (video_id uuid, real_bytes bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_co uuid := public.get_my_company_id();
  v_v record;
  v_size bigint;
  v_mime text;
BEGIN
  IF auth.uid() IS NULL OR v_co IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau de l''entreprise.' USING ERRCODE = '42501';
  END IF;
  SELECT v.id, v.file_path, v.mime_type, v.size_bytes, v.published_at, v.archived_at INTO v_v
    FROM public.training_videos v WHERE v.id = p_id AND v.company_id = v_co FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette vidéo est introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_v.published_at IS NOT NULL THEN
    RETURN QUERY SELECT v_v.id, v_v.size_bytes;
    RETURN;
  END IF;
  IF v_v.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cet envoi a été abandonné : recommencez.' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(nullif(o.metadata->>'size', '')::bigint, 0), lower(split_part(coalesce(o.metadata->>'mimetype', ''), ';', 1))
    INTO v_size, v_mime
    FROM storage.objects o WHERE o.bucket_id = 'formations' AND o.name = v_v.file_path;
  IF v_size IS NULL THEN
    RAISE EXCEPTION 'La vidéo n''est pas arrivée : relancez l''envoi.' USING ERRCODE = 'P0001';
  END IF;
  IF v_size > public.training_video_max_bytes() THEN
    RAISE EXCEPTION 'Vidéo trop lourde : % Mo maximum.', public.training_video_max_bytes() / 1048576 USING ERRCODE = '22023';
  END IF;
  UPDATE public.training_videos v
     SET size_bytes = v_size,
         mime_type = CASE WHEN v_mime IN ('video/mp4', 'video/quicktime', 'video/webm') THEN v_mime ELSE v.mime_type END,
         published_at = now()
   WHERE v.id = p_id;
  RETURN QUERY SELECT p_id, v_size;
END $fn$;

-- ── 9) Bureau : « Retirer » / « Remettre » ─────────────────────────────────
-- Retirer : archived_at + archived_by (heure du serveur) ; le fichier et les
-- « Vue » restent, et la place ne libère RIEN du quota. Seulement une vidéo
-- PUBLIÉE : une place pas encore publiée ne se retire pas (sinon elle sortirait
-- du décompte alors que son URL signée peut encore recevoir un fichier).
-- Remettre : seulement une vidéo publiée.
CREATE OR REPLACE FUNCTION public.set_training_video_archived(p_id uuid, p_archived boolean)
 RETURNS timestamptz
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_co uuid := public.get_my_company_id();
  v_at timestamptz;
BEGIN
  IF v_me IS NULL OR v_co IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau de l''entreprise.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_archived, true) THEN
    UPDATE public.training_videos v
       SET archived_at = coalesce(v.archived_at, now()), archived_by = CASE WHEN v.archived_at IS NULL THEN v_me ELSE v.archived_by END
     WHERE v.id = p_id AND v.company_id = v_co AND v.published_at IS NOT NULL
    RETURNING v.archived_at INTO v_at;
  ELSE
    UPDATE public.training_videos v SET archived_at = NULL, archived_by = NULL
     WHERE v.id = p_id AND v.company_id = v_co AND v.published_at IS NOT NULL
    RETURNING v.archived_at INTO v_at;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette vidéo est introuvable.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_at;
END $fn$;

-- ── 9 bis) Bureau : les fichiers arrivés mais jamais publiés ───────────────
-- Un envoi coupé avant la publication, ou une place fermée parce qu'un AUTRE
-- fichier est arrivé : le fichier est gardé (D12) et COMPTE dans les 100 Mo. Le
-- bureau doit le voir, avec sa vraie taille (« Envoi non terminé »), pour que
-- la jauge s'explique. Titre et public viennent de la place ; rien ici ne publie.
CREATE OR REPLACE FUNCTION public.training_video_leftovers()
 RETURNS TABLE (id uuid, title text, file_path text, real_bytes bigint, reserved_at timestamptz, archived_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_co uuid := public.get_my_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_co IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau de l''entreprise.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.id, v.title, v.file_path, coalesce(nullif(o.metadata->>'size', '')::bigint, 0)::bigint, v.reserved_at, v.archived_at
      FROM public.training_videos v
      JOIN storage.objects o ON o.bucket_id = 'formations' AND o.name = v.file_path
     WHERE v.company_id = v_co AND v.published_at IS NULL
     ORDER BY v.reserved_at DESC
     LIMIT 100;
END $fn$;

-- ── 10) Salarié, chef d'équipe : mes vidéos ────────────────────────────────
-- Publiées, non retirées, de MON entreprise, qui me sont destinées. Ni la
-- liste des destinataires, ni les « Vue » des autres. created_at = date de
-- publication. Un compte bureau n'en reçoit aucune.
CREATE OR REPLACE FUNCTION public.my_training_videos()
 RETURNS TABLE (id uuid, title text, file_path text, mime_type text, size_bytes bigint,
                duration_s integer, created_at timestamptz, seen_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT v.id, v.title, v.file_path, v.mime_type, v.size_bytes, v.duration_s, v.published_at, w.seen_at
    FROM public.training_videos v
    LEFT JOIN public.training_video_views w ON w.video_id = v.id AND w.user_id = auth.uid() AND w.undone_at IS NULL
   WHERE auth.uid() IS NOT NULL
     AND v.company_id = public.get_my_company_id()
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text IN ('worker', 'lead'))
     AND v.published_at IS NOT NULL AND v.archived_at IS NULL
     AND (v.all_team OR auth.uid() = ANY (v.assignee_ids))
   ORDER BY (w.seen_at IS NOT NULL), v.published_at DESC
   LIMIT 200
$fn$;

-- ── 11) « Vue » / « Annuler » ──────────────────────────────────────────────
-- p_seen vrai : pose « Vue » (une fois ; un second appel rend la même date ;
-- après un « Annuler », la ligne reprend une date neuve). p_seen faux :
-- « Annuler » — SA ligne, 10 minutes au plus, en posant undone_at.
CREATE OR REPLACE FUNCTION public.set_training_video_seen(p_video uuid, p_seen boolean DEFAULT true)
 RETURNS timestamptz
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
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
  IF NOT EXISTS (SELECT 1 FROM public.training_videos v
                  WHERE v.id = p_video AND v.company_id = v_co AND v.published_at IS NOT NULL AND v.archived_at IS NULL
                    AND (v.all_team OR v_me = ANY (v.assignee_ids))) THEN
    RAISE EXCEPTION 'Cette formation n''existe pas, ou ne vous est pas destinée.' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(p_seen, true) THEN
    INSERT INTO public.training_video_views AS w (video_id, user_id, company_id)
    VALUES (p_video, v_me, v_co)
    ON CONFLICT (video_id, user_id) DO UPDATE SET seen_at = now(), undone_at = NULL WHERE w.undone_at IS NOT NULL;
    SELECT w.seen_at INTO v_at FROM public.training_video_views w WHERE w.video_id = p_video AND w.user_id = v_me;
    RETURN v_at;
  END IF;
  UPDATE public.training_video_views w SET undone_at = now()
   WHERE w.video_id = p_video AND w.user_id = v_me AND w.undone_at IS NULL AND w.seen_at > now() - interval '10 minutes';
  IF NOT FOUND AND EXISTS (SELECT 1 FROM public.training_video_views w
                            WHERE w.video_id = p_video AND w.user_id = v_me AND w.undone_at IS NULL) THEN
    RAISE EXCEPTION 'Trop tard pour annuler : « Vue » est enregistrée.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $fn$;

-- ── 12) Droits des fonctions (repris explicitement : voir « DROITS ») ──────
REVOKE ALL ON FUNCTION public.training_video_quota_bytes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_video_max_bytes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_video_usage(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_video_upload_ok(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_video_readable(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_video_limits() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_training_video(text, boolean, uuid[], text, bigint, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_training_video(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_training_video_archived(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_training_videos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_video_leftovers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_training_video_seen(uuid, boolean) FROM PUBLIC, anon;
-- Les deux fonctions des policies du bucket : appelées avec les droits de l'utilisateur connecté.
GRANT EXECUTE ON FUNCTION public.training_video_upload_ok(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_video_readable(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_video_limits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_training_video(text, boolean, uuid[], text, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_training_video(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_training_video_archived(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_training_videos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_video_leftovers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_training_video_seen(uuid, boolean) TO authenticated;
