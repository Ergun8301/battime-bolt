-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 24 (oct. 2026) — DOCUMENTS : FACTURES RÉSERVÉES AU BUREAU, CATÉGORIE MODIFIABLE
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠ CHANGEMENT NON ADDITIF DANS SES EFFETS : dès cette migration, les salariés et
-- les chefs d'équipe ne voient plus les factures (catégories « facture » et
-- « facture_payee ») : ni la ligne dans la liste des documents, ni le fichier
-- (lecture, lien signé, liste du bucket), ni le nom d'une formation liée à une
-- facture. Le code des objets existants n'est pas modifié, mais des personnes
-- PERDENT une vue qu'elles avaient. 0 document en production au 12/10/2026 :
-- rien à migrer, personne ne perd rien aujourd'hui.
--
-- RETOUR ARRIÈRE — on retire ce qui a été ajouté, dans CET ordre (la règle du
-- stockage dépend de la fonction) et on recolle les définitions d'origine de
-- my_trainings() (lot 6) et de guard_document_write() (étape 12 bis). Après retour arrière : les salariés revoient les
-- factures, la catégorie n'est plus modifiable et le bouton disparaît de
-- l'application (la fonction « suis-je prête ? » n'existe plus). La table
-- public.document_category_log et son contenu sont GARDÉS (rien n'est effacé) ;
-- pour la retirer aussi, À PART et seulement avec l'accord d'Ergun :
-- DROP TABLE IF EXISTS public.document_category_log;
-- Copier les lignes ENTRE « DÉBUT » et « FIN » en retirant au début de chaque
-- ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP POLICY IF EXISTS chantier_docs_factures_bureau ON storage.objects;
-- DROP POLICY IF EXISTS documents_factures_bureau ON public.documents;
-- DROP POLICY IF EXISTS documents_update_categorie ON public.documents;
-- DROP TRIGGER IF EXISTS documents_a_category_guard ON public.documents;
-- DROP TRIGGER IF EXISTS documents_z_category_log ON public.documents;
-- REVOKE UPDATE (category, label) ON public.documents FROM authenticated;
-- GRANT UPDATE ON public.documents TO anon, authenticated;
-- DROP FUNCTION IF EXISTS public.chantier_doc_readable(text);
-- DROP FUNCTION IF EXISTS public.guard_document_category();
-- DROP FUNCTION IF EXISTS public.log_document_category();
-- DROP FUNCTION IF EXISTS public.document_category_ready();
-- DROP INDEX IF EXISTS public.documents_facture_path_idx;
-- -- Définition d'origine de public.my_trainings() (lot 6, 20261010210000, § 4), recollée :
-- CREATE OR REPLACE FUNCTION public.my_trainings()
--  RETURNS TABLE (id uuid, title text, kind text, video_url text,
--                 document_name text, document_path text, document_mime text,
--                 created_at timestamptz, seen_at timestamptz)
--  LANGUAGE sql STABLE SECURITY DEFINER
--  SET search_path TO ''
-- AS $fn$
--   SELECT t.id, t.title, t.kind, t.video_url,
--          CASE WHEN d.id IS NOT NULL THEN coalesce(nullif(btrim(d.label), ''), d.file_name, 'Document') END,
--          d.file_path, d.mime_type, t.created_at, v.seen_at
--     FROM public.trainings t
--     LEFT JOIN public.documents d ON d.id = t.document_id AND d.company_id = t.company_id
--     LEFT JOIN public.training_views v ON v.training_id = t.id AND v.user_id = auth.uid()
--    WHERE auth.uid() IS NOT NULL
--      AND t.company_id = public.get_my_company_id()
--      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role::text IN ('worker', 'lead'))
--      AND t.archived_at IS NULL
--      AND (t.all_team OR auth.uid() = ANY (t.assignee_ids))
--      AND (t.kind = 'video' OR d.id IS NOT NULL)
--    ORDER BY (v.seen_at IS NOT NULL), t.created_at DESC
--    LIMIT 200
-- $fn$;
-- REVOKE ALL ON FUNCTION public.my_trainings() FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.my_trainings() TO authenticated;
-- -- Définition d'origine de public.guard_document_write() (étape 12 bis, 20260920200500), recollée :
-- CREATE OR REPLACE FUNCTION public.guard_document_write()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $fn$
-- DECLARE
--   v_company uuid;
--   v_worksite uuid;
--   v_date date;
--   v_no int;
-- BEGIN
--   -- Le chantier appartient bien à l'entreprise de la pièce.
--   IF NOT EXISTS (SELECT 1 FROM public.worksites w
--                  WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
--     RAISE EXCEPTION 'documents: chantier hors de votre entreprise';
--   END IF;
--
--   IF new.time_entry_id IS NOT NULL THEN
--     SELECT t.company_id, t.worksite_id, t.work_date
--       INTO v_company, v_worksite, v_date
--       FROM public.time_entries t WHERE t.id = new.time_entry_id;
--     IF v_company IS NULL THEN
--       RAISE EXCEPTION 'documents: intervention introuvable';
--     END IF;
--     IF v_company <> new.company_id OR v_worksite IS DISTINCT FROM new.worksite_id THEN
--       RAISE EXCEPTION 'documents: cette intervention n''est pas celle de ce chantier';
--     END IF;
--     -- Le jour est celui de l'intervention, point. On le rectifie au lieu de
--     -- refuser : le navigateur n'a pas à être la source de cette date.
--     new.work_date := v_date;
--   END IF;
--
--   -- Nom automatique d'une photo. Un fichier choisi par la personne garde le nom
--   -- qu'elle lui a donné : le navigateur l'envoie, et on n'y touche pas.
--   IF TG_OP = 'INSERT'
--      AND nullif(btrim(coalesce(new.label, '')), '') IS NULL
--      AND coalesce(new.mime_type, '') LIKE 'image/%' THEN
--
--     -- Un seul attributeur à la fois pour ce chantier, le temps de la
--     -- transaction. Sans ça, deux téléphones lisent le même MAX.
--     PERFORM pg_advisory_xact_lock(hashtextextended(new.worksite_id::text, 0));
--
--     SELECT COALESCE(max(d.photo_no), 0) + 1 INTO v_no
--     FROM public.documents d
--     WHERE d.worksite_id = new.worksite_id
--       AND COALESCE(d.work_date, DATE '0001-01-01') = COALESCE(new.work_date, DATE '0001-01-01');
--
--     new.photo_no := v_no;
--     new.label := 'Photo ' || v_no
--                  || CASE WHEN new.work_date IS NOT NULL
--                          THEN ' — ' || to_char(new.work_date, 'DD/MM/YYYY')
--                          ELSE '' END;
--   END IF;
--
--   RETURN new;
-- END;
-- $fn$;
-- ── FIN DU RETOUR ARRIÈRE ──
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 14 colonnes à
-- true (le test l'exécute telle quelle).
-- ── DÉBUT DE LA VÉRIFICATION ──
-- SELECT
--   (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.document_category_log'::regclass) AS v1_trace_rls_active,
--   (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'document_category_log') = 'document_category_log_select_office:SELECT' AS v2_trace_une_regle_lecture,
--   has_table_privilege('authenticated', 'public.document_category_log', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.document_category_log', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('anon', 'public.document_category_log', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v3_trace_droits,
--   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_factures_bureau' AND permissive = 'RESTRICTIVE' AND cmd = 'SELECT') AS v4_regle_factures_lecture,
--   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_update_categorie' AND permissive = 'PERMISSIVE' AND cmd = 'UPDATE') AS v5_regle_mise_a_jour,
--   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chantier_docs_factures_bureau' AND permissive = 'RESTRICTIVE' AND cmd = 'SELECT') AS v6_regle_stockage,
--   has_column_privilege('authenticated', 'public.documents', 'category', 'UPDATE') AND has_column_privilege('authenticated', 'public.documents', 'label', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.documents', 'file_path', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.documents', 'UPDATE') AND NOT has_any_column_privilege('anon', 'public.documents', 'UPDATE') AS v7_droits_de_colonne,
--   EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'documents_a_category_guard' AND t.tgrelid = 'public.documents'::regclass AND NOT t.tgisinternal AND t.tgtype & 1 = 1 AND t.tgtype & 2 = 2 AND t.tgtype & 4 = 4 AND t.tgtype & 16 = 16) AND 'documents_a_category_guard' COLLATE "C" < (SELECT min(t.tgname COLLATE "C") FROM pg_trigger t WHERE t.tgrelid = 'public.documents'::regclass AND NOT t.tgisinternal AND t.tgname = 'documents_guard_write') AS v8_garde_avant_le_recalage,
--   EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'documents_z_category_log' AND t.tgrelid = 'public.documents'::regclass AND NOT t.tgisinternal AND t.tgtype & 1 = 1 AND t.tgtype & 2 = 0 AND t.tgtype & 16 = 16) AS v9_trace_apres_mise_a_jour,
--   (SELECT count(*) = 2 AND bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""' AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('guard_document_category', 'log_document_category')) AS v10_declencheurs_fermes,
--   (SELECT count(*) = 2 AND bool_and(array_to_string(p.proconfig, ',') = 'search_path=""' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND (p.prosecdef OR p.proname = 'document_category_ready')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('chantier_doc_readable', 'document_category_ready')) AS v11_fonctions_ouvertes_aux_connectes,
--   EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'documents_facture_path_idx' AND i.indrelid = 'public.documents'::regclass AND i.indpred IS NOT NULL) AS v12_index_partiel,
--   position('facture_payee' in pg_get_functiondef('public.my_trainings()'::regprocedure)) > 0 AS v13_formations_sans_factures,
--   position('new.company_id IS DISTINCT FROM old.company_id' in pg_get_functiondef('public.guard_document_write()'::regprocedure)) > 0 AS v14_recalage_seulement_si_lien_change;
-- ── FIN DE LA VÉRIFICATION ──
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261013120200', 'lot24_documents_factures_categorie') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- AVANT D'APPLIQUER (Ergun) : vérifier qu'aucune règle de mise à jour n'a été
-- posée à la main sur documents (elle se combinerait en OU avec la nôtre ; le
-- déclencheur resterait le garde) :
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'documents';
--   → 4 règles attendues : documents_select, documents_insert, documents_delete,
--     support_read.
-- Et que la fonction guard_document_write() est bien celle de l'étape 12 bis (ce
-- fichier la remplace par la même, avec UNE condition de plus, § 10) :
--   SELECT position('IF new.time_entry_id IS NOT NULL THEN' IN pg_get_functiondef('public.guard_document_write()'::regprocedure)) > 0 AS fonction_d_origine;
--   → true.
--
-- POURQUOI. Décision D11 : les factures sont réservées au bureau (admin). Et le
-- bureau doit pouvoir changer la catégorie d'un document après coup (jusqu'ici
-- elle était figée à l'envoi, et aucune règle de mise à jour n'existait : même
-- l'action « modifier_document » de l'assistant bureau échouait sans erreur).
--
-- CE QUE FAIT CE FICHIER (rien d'existant n'est remplacé, sauf my_trainings()
-- qui reçoit UN filtre, et guard_document_write() qui reçoit UNE condition,
-- tous deux non destructifs) :
--   1. document_category_ready() : la fonction « suis-je prête ? » ; l'écran
--      l'appelle et cache le bouton « catégorie » tant qu'elle manque.
--   2. document_category_log : la trace de chaque changement de catégorie
--      (avant / après, qui, quel rôle, quand). Écrite par déclencheur SEULEMENT,
--      lue par le bureau de l'entreprise SEULEMENT. Aucune clé étrangère : la
--      trace survit au document ; rien ne la modifie ni ne l'efface.
--   3. documents_a_category_guard (AVANT INSERT / UPDATE) : un non-bureau ne
--      dépose pas de facture ; seule la catégorie d'un document change (plus
--      « label » pour le bureau) ; un salarié ne change que la catégorie de SES
--      documents, dans {sans catégorie, photo, plan, devis, pv_reception,
--      autre}, jamais vers ni depuis « facture » / « reserve ». Il porte un nom
--      qui passe AVANT documents_guard_write (ordre alphabétique) pour voir ce
--      que le navigateur a envoyé avant le recalage de work_date. Il laisse passer
--      la mise à NULL de time_entry_id / uploaded_by faite par la base elle-même
--      (action « SET NULL » des clés étrangères) : sans cela, supprimer une
--      intervention qui porte un document échouerait.
--   4. documents_z_category_log (APRÈS UPDATE OF category) : écrit la trace.
--   5. documents_factures_bureau : règle RESTRICTIVE de lecture sur documents
--      (se combine en ET avec documents_select et support_read) : une facture
--      n'est lisible que du bureau de SON entreprise. Effet de bord voulu : un
--      salarié ne peut ni modifier ni effacer (avec un filtre) une facture qu'il
--      ne voit plus. Le compte support (lecture seule, lot 5) ne les voit pas non
--      plus, même s'il est bureau de sa propre entreprise.
--   6. documents_update_categorie : règle de mise à jour (le bureau de
--      l'entreprise, ou l'auteur du document) ; le déclencheur fait le tri fin.
--   7. Droits de colonne : UPDATE retiré de la table, rendu sur (category, label)
--      seulement (ceinture ; le déclencheur reste le vrai garde). Les droits par
--      défaut de la production donnent TOUS les droits aux objets neufs.
--   8. chantier_doc_readable() + chantier_docs_factures_bureau : règle
--      RESTRICTIVE de lecture sur storage.objects, bucket chantier-docs
--      seulement. Le fichier d'une facture n'est lisible (téléchargement, lien
--      signé, liste) que du bureau du dossier de son entreprise. Une
--      sous-requête directe sur documents dans la règle FUIRAIT (la sécurité de
--      ligne du salarié lui cache la ligne « facture »), d'où une fonction
--      SECURITY DEFINER à search_path vide (modèle : training_video_readable).
--      Un fichier sans ligne (envoi en cours, orphelin) reste lisible comme avant.
--   9. my_trainings() : même signature, même corps, UN filtre de plus dans la
--      jointure : un document devenu facture n'est plus rendu (nom + chemin hors
--      sécurité de ligne : seul chemin SQL qui aurait contourné la règle 5).
--  10. guard_document_write() : le contrôle du rattachement à l'intervention et le
--      recalage de work_date ne jouent plus qu'à l'envoi ou quand time_entry_id,
--      worksite_id ou company_id change. Avant, time_entries.worksite_id (ou
--      work_date) modifié depuis l'envoi rendait le document intouchable : le bureau
--      ne pouvait plus le passer en facture (erreur P0001), et tout changement de
--      catégorie déplaçait le document de journée.
--
-- AUCUNE règle d'insertion ni de suppression de documents n'est touchée, aucun
-- ALTER POLICY, aucun DROP POLICY : le lot 29 modifie documents_insert et
-- documents_delete en parallèle, l'ordre d'application des deux migrations est
-- indifférent. Aucune règle de suppression de stockage n'est ajoutée ni
-- changée (le trou préexistant — tout membre efface un fichier de son dossier —
-- reste ; seuls les fichiers de FACTURE sont protégés, car l'effacement doit
-- d'abord les lire).
--
-- LIMITES CONNUES. L'éditeur SQL et la clé de service (pas d'auth.uid()) ne sont
-- pas contrôlés par le déclencheur (même choix que guard_time_entry_write) ;
-- aucune fonction edge n'écrit dans documents. Les liens signés déjà émis
-- restent valables jusqu'à leur expiration. Si l'intervention rattachée a changé de
-- jour ou de chantier depuis l'envoi, work_date et le chantier du document ne
-- bougent pas lors d'un changement de catégorie (§ 10). Rejouable : IF NOT EXISTS / OR REPLACE.

-- ── 1) « Suis-je prête ? » ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_category_ready()
 RETURNS boolean
 LANGUAGE sql STABLE
 SET search_path TO ''
AS $fn$ SELECT true $fn$;
REVOKE ALL ON FUNCTION public.document_category_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_category_ready() TO authenticated;

-- ── 2) La trace des changements de catégorie ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_category_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id   uuid NOT NULL,
  document_id  uuid NOT NULL,
  worksite_id  uuid,
  old_category text,
  new_category text,
  actor_id     uuid,   -- auth.uid() ; NULL = éditeur SQL / service
  actor_role   text,   -- son rôle à cet instant
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_category_log_doc_idx ON public.document_category_log (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_category_log_company_idx ON public.document_category_log (company_id, created_at DESC);
COMMENT ON TABLE public.document_category_log IS 'Lot 24 : changements de catégorie des documents (avant/après, qui). Écrite UNIQUEMENT par un déclencheur ; personne ne la modifie ni ne l''efface. Pas de clé étrangère : la trace survit au document.';
ALTER TABLE public.document_category_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_category_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.document_category_log TO authenticated, service_role;
REVOKE ALL ON SEQUENCE public.document_category_log_id_seq FROM PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'document_category_log' AND policyname = 'document_category_log_select_office') THEN
    CREATE POLICY document_category_log_select_office ON public.document_category_log FOR SELECT TO authenticated
      USING (company_id = (SELECT public.get_my_company_id()) AND (SELECT public.is_admin()));
  END IF;
END $do$;

-- ── 3) Le garde : qui peut poser, quitter ou changer une catégorie ─────────
-- « Bureau » = admin actif de l'entreprise DU DOCUMENT (is_admin() n'est pas
-- limitée à l'entreprise : on la couple toujours à company_id). Un chef
-- d'équipe (lead) est un salarié.
CREATE OR REPLACE FUNCTION public.guard_document_category()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_office boolean;
  -- Ce qu'un salarié peut poser / quitter sur SON document : jamais une facture,
  -- jamais « reserve » (elle alimente le rapport de réserves). NULL compte comme « autre ».
  v_light  text[] := ARRAY['photo', 'plan', 'devis', 'pv_reception', 'autre'];
BEGIN
  -- Éditeur SQL / clé de service : personne de connecté, pas de contrôle
  -- (même choix que guard_time_entry_write). Aucune fonction edge n'écrit ici.
  IF v_uid IS NULL THEN RETURN new; END IF;

  IF TG_OP = 'INSERT' THEN
    v_office := coalesce(public.is_admin() AND new.company_id = public.get_my_company_id(), false);
    IF NOT v_office AND new.category IN ('facture', 'facture_payee') THEN
      RAISE EXCEPTION 'Les factures sont réservées au bureau.' USING ERRCODE = '42501';
    END IF;
    RETURN new;
  END IF;

  -- UPDATE
  -- Action de clé étrangère (« SET NULL » de time_entry_id ou de uploaded_by) : la base
  -- elle-même met la colonne à NULL quand l'intervention ou l'utilisateur disparaît, avec
  -- l'auth.uid() de l'appelant. Ce n'est pas une modification du document : on laisse passer
  -- (sinon supprimer une intervention qui porte un document échouerait). Seul ce cas : colonne
  -- à NULL, tout le reste identique, et profondeur d'imbrication > 1 (un UPDATE du navigateur
  -- est à la profondeur 1 et reste soumis aux contrôles ci-dessous).
  IF pg_trigger_depth() > 1
     AND (to_jsonb(new) - 'time_entry_id' - 'uploaded_by') IS NOT DISTINCT FROM (to_jsonb(old) - 'time_entry_id' - 'uploaded_by')
     AND (new.time_entry_id IS NOT DISTINCT FROM old.time_entry_id OR new.time_entry_id IS NULL)
     AND (new.uploaded_by IS NOT DISTINCT FROM old.uploaded_by OR new.uploaded_by IS NULL) THEN
    RETURN new;
  END IF;
  v_office := coalesce(public.is_admin() AND old.company_id = public.get_my_company_id(), false);
  -- Robuste aux colonnes futures : tout ce qui n'est pas dans la liste doit être identique.
  IF (to_jsonb(new) - CASE WHEN v_office THEN ARRAY['category', 'label'] ELSE ARRAY['category'] END)
     IS DISTINCT FROM
     (to_jsonb(old) - CASE WHEN v_office THEN ARRAY['category', 'label'] ELSE ARRAY['category'] END) THEN
    RAISE EXCEPTION 'Seule la catégorie d''un document peut être modifiée.' USING ERRCODE = '42501';
  END IF;
  IF v_office OR new.category IS NOT DISTINCT FROM old.category THEN RETURN new; END IF;

  -- Non-bureau, catégorie qui change
  IF old.uploaded_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Vous ne pouvez corriger que vos propres documents.' USING ERRCODE = '42501';
  END IF;
  IF new.category IN ('facture', 'facture_payee') OR old.category IN ('facture', 'facture_payee') THEN
    RAISE EXCEPTION 'Les factures sont réservées au bureau.' USING ERRCODE = '42501';
  END IF;
  IF NOT (coalesce(old.category, 'autre') = ANY (v_light)) OR NOT (coalesce(new.category, 'autre') = ANY (v_light)) THEN
    RAISE EXCEPTION 'Cette catégorie est réservée au bureau.' USING ERRCODE = '42501';
  END IF;
  RETURN new;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_document_category() FROM PUBLIC, anon, authenticated;

-- Le « a » du nom place ce déclencheur AVANT documents_guard_write (les
-- déclencheurs d'une même table partent par ordre alphabétique du nom).
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'documents_a_category_guard' AND tgrelid = 'public.documents'::regclass) THEN
    CREATE TRIGGER documents_a_category_guard BEFORE INSERT OR UPDATE ON public.documents
      FOR EACH ROW EXECUTE FUNCTION public.guard_document_category();
  END IF;
END $do$;

-- ── 4) La trace ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_document_category()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF new.category IS DISTINCT FROM old.category THEN
    INSERT INTO public.document_category_log (company_id, document_id, worksite_id, old_category, new_category, actor_id, actor_role)
    VALUES (new.company_id, new.id, new.worksite_id, old.category, new.category, auth.uid(),
            (SELECT u.role::text FROM public.users u WHERE u.id = auth.uid()));
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.log_document_category() FROM PUBLIC, anon, authenticated;

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'documents_z_category_log' AND tgrelid = 'public.documents'::regclass) THEN
    CREATE TRIGGER documents_z_category_log AFTER UPDATE OF category ON public.documents
      FOR EACH ROW EXECUTE FUNCTION public.log_document_category();
  END IF;
END $do$;

-- ── 5) Règles sur documents (ajout seulement) ──────────────────────────────
DO $do$ BEGIN
  -- Lecture : une facture n'est visible que du bureau de SON entreprise
  -- (ET avec les règles permissives documents_select et support_read).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_factures_bureau') THEN
    CREATE POLICY documents_factures_bureau ON public.documents AS RESTRICTIVE FOR SELECT TO authenticated
      USING (category IS NULL OR category NOT IN ('facture', 'facture_payee')
             OR (company_id = (SELECT public.get_my_company_id()) AND (SELECT public.is_admin())));
  END IF;
  -- Mise à jour : le bureau de l'entreprise, ou l'auteur. Le déclencheur fait le tri fin.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_update_categorie') THEN
    CREATE POLICY documents_update_categorie ON public.documents FOR UPDATE TO authenticated
      USING (company_id = (SELECT public.get_my_company_id()) AND ((SELECT public.is_admin()) OR uploaded_by = (SELECT auth.uid())))
      WITH CHECK (company_id = (SELECT public.get_my_company_id()) AND ((SELECT public.is_admin()) OR uploaded_by = (SELECT auth.uid())));
  END IF;
END $do$;

-- ── 6) Droits de colonne (ceinture ; le déclencheur reste le vrai garde) ───
REVOKE UPDATE ON public.documents FROM PUBLIC, anon, authenticated;
GRANT UPDATE (category, label) ON public.documents TO authenticated;

-- ── 7) Stockage « chantier-docs » : le fichier d'une facture suit la ligne ──
CREATE OR REPLACE FUNCTION public.chantier_doc_readable(p_name text)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  SELECT coalesce(
    -- un fichier qui n'est PAS celui d'une facture (ou sans ligne : orphelin, ou envoi en cours) reste lisible comme avant
    NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = p_name AND d.category IN ('facture', 'facture_payee'))
    -- une facture : le bureau, dans le dossier de SON entreprise
    OR (auth.uid() IS NOT NULL AND public.is_admin() AND split_part(p_name, '/', 1) = public.get_my_company_id()::text),
    false)
$fn$;
REVOKE ALL ON FUNCTION public.chantier_doc_readable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chantier_doc_readable(text) TO authenticated;

-- Règle de LECTURE seulement : l'envoi d'un fichier sans ligne n'est pas gêné.
-- Le test porte sur TOUTES les lignes portant ce chemin (file_path n'est pas
-- unique : le « Annuler » d'une suppression réinsère la ligne, même chemin).
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chantier_docs_factures_bureau') THEN
    CREATE POLICY chantier_docs_factures_bureau ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
      USING (bucket_id <> 'chantier-docs' OR public.chantier_doc_readable(name));
  END IF;
END $do$;

-- ── 8) Index partiel (la règle ci-dessus ne parcourt pas toute la table) ───
CREATE INDEX IF NOT EXISTS documents_facture_path_idx ON public.documents (file_path) WHERE category IN ('facture', 'facture_payee');

-- ── 9) my_trainings() : un document devenu facture n'est plus rendu ────────
-- Même signature et même corps que le lot 6, à UNE différence : la condition
-- de catégorie dans la jointure. La condition existante « kind = 'video' OU
-- document trouvé » écarte alors la formation « document ». Le bureau voit
-- toujours la formation dans son propre écran.
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
                                AND (d.category IS NULL OR d.category NOT IN ('facture', 'facture_payee'))
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
-- Droits du lot 6, répétés à l'identique par prudence.
REVOKE ALL ON FUNCTION public.my_trainings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_trainings() TO authenticated;

-- ── 10) guard_document_write() : le recalage ne joue plus à chaque mise à jour ─
-- Même signature, même corps que l'étape 12 bis, à UNE différence : la condition du
-- bloc « intervention » (voir le commentaire dans le corps). Droits inchangés
-- (CREATE OR REPLACE les garde). Retour arrière : la définition d'origine est
-- recollable depuis l'en-tête.
CREATE OR REPLACE FUNCTION public.guard_document_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid;
  v_worksite uuid;
  v_date date;
  v_no int;
BEGIN
  -- Le chantier appartient bien à l'entreprise de la pièce.
  IF NOT EXISTS (SELECT 1 FROM public.worksites w
                 WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'documents: chantier hors de votre entreprise';
  END IF;

  -- Lot 24 : le rattachement n'est contrôlé (et work_date recalé d'après l'intervention) qu'à
  -- l'envoi, ou quand il change. Sinon, l'intervention a pu changer de chantier ou de jour
  -- depuis l'envoi (time_entries.worksite_id et work_date sont modifiables) : le bureau
  -- n'aurait plus pu changer la catégorie du document (donc le passer en facture), et un simple
  -- changement de catégorie aurait déplacé le document de journée.
  IF new.time_entry_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR new.time_entry_id IS DISTINCT FROM old.time_entry_id
          OR new.worksite_id IS DISTINCT FROM old.worksite_id
          OR new.company_id IS DISTINCT FROM old.company_id) THEN
    SELECT t.company_id, t.worksite_id, t.work_date
      INTO v_company, v_worksite, v_date
      FROM public.time_entries t WHERE t.id = new.time_entry_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'documents: intervention introuvable';
    END IF;
    IF v_company <> new.company_id OR v_worksite IS DISTINCT FROM new.worksite_id THEN
      RAISE EXCEPTION 'documents: cette intervention n''est pas celle de ce chantier';
    END IF;
    -- Le jour est celui de l'intervention, point. On le rectifie au lieu de
    -- refuser : le navigateur n'a pas à être la source de cette date.
    new.work_date := v_date;
  END IF;

  -- Nom automatique d'une photo. Un fichier choisi par la personne garde le nom
  -- qu'elle lui a donné : le navigateur l'envoie, et on n'y touche pas.
  IF TG_OP = 'INSERT'
     AND nullif(btrim(coalesce(new.label, '')), '') IS NULL
     AND coalesce(new.mime_type, '') LIKE 'image/%' THEN

    -- Un seul attributeur à la fois pour ce chantier, le temps de la
    -- transaction. Sans ça, deux téléphones lisent le même MAX.
    PERFORM pg_advisory_xact_lock(hashtextextended(new.worksite_id::text, 0));

    SELECT COALESCE(max(d.photo_no), 0) + 1 INTO v_no
    FROM public.documents d
    WHERE d.worksite_id = new.worksite_id
      AND COALESCE(d.work_date, DATE '0001-01-01') = COALESCE(new.work_date, DATE '0001-01-01');

    new.photo_no := v_no;
    new.label := 'Photo ' || v_no
                 || CASE WHEN new.work_date IS NOT NULL
                         THEN ' — ' || to_char(new.work_date, 'DD/MM/YYYY')
                         ELSE '' END;
  END IF;

  RETURN new;
END;
$fn$;
