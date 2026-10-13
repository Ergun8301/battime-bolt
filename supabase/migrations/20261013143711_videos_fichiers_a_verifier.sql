-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 14 (oct. 2026) — VIDÉOS : FICHIERS À VÉRIFIER (détection seulement)
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE — une seule fonction ajoutée, rien d'existant remplacé. Elle ne
-- modifie aucune donnée. Copier la ligne ENTRE « DÉBUT » et « FIN » en retirant
-- « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP FUNCTION IF EXISTS public.video_files_audit();
-- ── FIN DU RETOUR ARRIÈRE ──
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 6 colonnes à true
-- (6 × true ; le test l'exécute telle quelle).
-- ── DÉBUT DE LA VÉRIFICATION ──
-- SELECT
--   (SELECT count(*) = 1 AND bool_and(p.prosecdef AND p.provolatile = 's' AND array_to_string(p.proconfig, ',') = 'search_path=""') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'video_files_audit') AS v1_definer_stable_search_path_vide,
--   (SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND has_function_privilege('authenticated', p.oid, 'EXECUTE') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'video_files_audit') AS v2_anon_non_authenticated_oui,
--   (SELECT (r.rolsuper OR r.rolbypassrls) AND has_table_privilege(r.oid, 'storage.objects', 'SELECT') FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'video_files_audit') AS v3_proprietaire_lit_le_stockage,
--   (SELECT count(*) = 12 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%training_video%') AS v4_lot13_intact_12_fonctions,
--   (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'formations%') = 'formations_office_insert:INSERT,formations_read:SELECT' AS v5_stockage_inchange,
--   NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.training_videos'::regclass, 'public.training_video_views'::regclass)) AS v6_aucun_trigger;
-- ── FIN DE LA VÉRIFICATION ──
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261013143711', 'videos_fichiers_a_verifier') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : décision D12 — les fichiers sans formation sont GARDÉS, rien n'est
-- supprimé sans l'accord d'Ergun. Cette fonction ne fait que les SIGNALER au
-- bureau : (a) un fichier du dossier privé « formations » de l'entreprise qu'aucune
-- formation n'utilise ; (b) une formation publiée dont le fichier est introuvable
-- (le salarié verrait « Lecture impossible »). Les fichiers arrivés d'un envoi
-- non terminé ont une ligne (non publiée) : ils restent dans training_video_leftovers()
-- et ne sont PAS repris ici. Une place réservée dont le fichier n'est pas encore
-- arrivé n'est ni l'un ni l'autre. Une ligne naît toujours AVANT son fichier (la
-- policy d'envoi l'exige) et la publication exige le fichier : un envoi en cours
-- ne peut donc pas produire de faux signalement.
-- Lecture seule : aucune écriture, aucune suppression, aucun appel réseau.
-- Au plus 100 lignes par sorte ; total_n et total_bytes comptent TOUT.
-- Les « .emptyFolderPlaceholder » créés par le tableau de bord (à la racine du dossier
-- ou dans un sous-dossier) sont ignorés : un faux signalement qu'on ne peut pas lever.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.video_files_audit()
 RETURNS TABLE (kind text, video_id uuid, title text, file_path text, real_bytes bigint,
                occurred_at timestamptz, archived boolean, total_n bigint, total_bytes bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_co uuid := public.get_my_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_co IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau de l''entreprise.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  (SELECT 'fichier_sans_formation'::text, NULL::uuid, NULL::text, f.name::text, f.b, f.created_at,
          NULL::boolean, (count(*) OVER ())::bigint, (sum(f.b) OVER ())::bigint
     FROM (SELECT o.name, coalesce(nullif(o.metadata->>'size', ''), '0')::bigint AS b, o.created_at
             FROM storage.objects o
            WHERE o.bucket_id = 'formations'
              AND o.name LIKE v_co::text || '/%'
              AND o.name NOT LIKE '%/.emptyFolderPlaceholder'
              AND NOT EXISTS (SELECT 1 FROM public.training_videos v WHERE v.file_path = o.name)) f
    ORDER BY f.created_at DESC
    LIMIT 100)
  UNION ALL
  (SELECT 'formation_sans_fichier'::text, v.id, v.title, v.file_path, coalesce(v.size_bytes, 0)::bigint, v.published_at,
          (v.archived_at IS NOT NULL), (count(*) OVER ())::bigint, 0::bigint
     FROM public.training_videos v
    WHERE v.company_id = v_co AND v.published_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'formations' AND o.name = v.file_path)
    ORDER BY v.published_at DESC
    LIMIT 100);
END $fn$;

-- ── Droits explicites : le bureau connecté seulement (le corps refuse en plus un non-bureau) ──
REVOKE ALL ON FUNCTION public.video_files_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.video_files_audit() TO authenticated;
