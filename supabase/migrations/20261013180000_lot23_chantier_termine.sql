-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 23 (oct. 2026) — CHANTIER TERMINÉ + BILAN DU CHANTIER
-- ═════════════════════════════════════════════════════════════════════════════
-- 100 % ADDITIF. Aucune règle d'accès existante n'est modifiée, aucune donnée
-- n'est touchée, aucune ligne n'est supprimée. Ce fichier ne fait que :
--   · poser le STATUT « terminé le… » sur un chantier (deux colonnes) ;
--   · donner au bureau, et à lui seul, UNE fonction pour le poser ou le retirer ;
--   · fermer le statut aux salariés par un déclencheur (ceinture : leurs règles
--     d'accès ne leur permettent déjà que d'INSÉRER un chantier).
-- Le bilan du chantier (heures, dépenses, réserves, documents, budget) n'a PAS
-- besoin de la base : il est calculé par le navigateur avec les lectures
-- existantes (my_worksite_labour, worksite_expenses, time_entries, documents).
--
-- « Terminé » n'est PAS « archivé » : un chantier terminé reste actif (is_active
-- ne bouge pas), garde ses heures, son historique et ses documents ; il n'est
-- simplement plus PROPOSÉ au salarié pour une nouvelle intervention ou un nouveau
-- pointage (le masquage est dans les listes de choix de l'application, pas en base).
-- Aucun blocage en base sur les écritures : on ne casse rien.
--
-- ⚠ À SAVOIR AVANT D'APPLIQUER : la colonne completed_at figure déjà dans le type
-- Worksite de l'application (lib/types.ts) et, d'après l'audit du 13/10/2026,
-- dans la base de production (type timestamptz, 0 ligne renseignée) ; aucune
-- migration du dépôt ne la crée (la table worksites date d'avant le dépôt).
-- « ADD COLUMN IF NOT EXISTS » rend les deux cas sûrs. Vérifier d'abord :
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'worksites' AND column_name IN ('completed_at', 'completed_by');
--   → completed_at (timestamptz) peut déjà être là ; completed_by ne l'est pas.
--
-- RETOUR ARRIÈRE — on retire les trois fonctions et le déclencheur, dans CET
-- ordre. Les colonnes completed_at et completed_by sont GARDÉES (rien n'est
-- effacé, et completed_at existait peut-être avant ce lot : ne pas la retirer).
-- Après retour arrière : le bouton « Terminer » et le bilan disparaissent de
-- l'application (la fonction « suis-je prête ? » n'existe plus), mais un chantier
-- déjà marqué terminé reste masqué dans les listes de choix du salarié (c'est la
-- donnée qui décide). Pour le rouvrir : UPDATE public.worksites SET completed_at = NULL,
-- completed_by = NULL WHERE id = '…'; (éditeur SQL).
-- Copier les lignes ENTRE « DÉBUT » et « FIN » en retirant au début de chaque
-- ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP TRIGGER IF EXISTS worksites_guard_completion ON public.worksites;
-- DROP FUNCTION IF EXISTS public.guard_worksite_completion();
-- DROP FUNCTION IF EXISTS public.set_worksite_completed(uuid, date);
-- DROP FUNCTION IF EXISTS public.worksite_completion_ready();
-- ── FIN DU RETOUR ARRIÈRE ──
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 9 colonnes à true
-- (le test l'exécute telle quelle).
-- ── DÉBUT DE LA VÉRIFICATION ──
-- SELECT
--   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'worksites' AND column_name = 'completed_at' AND data_type IN ('timestamp with time zone', 'date')) AS v1_colonne_date_de_fin,
--   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'worksites' AND column_name = 'completed_by' AND data_type = 'uuid') AS v2_colonne_qui,
--   (SELECT count(*) = 1 AND bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND array_to_string(p.proconfig, ',') = 'search_path=""' AND NOT p.prosecdef) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'worksite_completion_ready') AS v3_fonction_prete_ouverte_aux_connectes,
--   (SELECT count(*) = 1 AND bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'set_worksite_completed') AS v4_fonction_bureau_fermee_aux_anonymes,
--   position('public.is_admin()' in pg_get_functiondef('public.set_worksite_completed(uuid, date)'::regprocedure)) > 0 AND position('public.get_my_company_id()' in pg_get_functiondef('public.set_worksite_completed(uuid, date)'::regprocedure)) > 0 AS v5_bureau_de_la_bonne_entreprise,
--   (SELECT count(*) = 1 AND bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""' AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'guard_worksite_completion') AS v6_garde_fermee,
--   EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'worksites_guard_completion' AND t.tgrelid = 'public.worksites'::regclass AND NOT t.tgisinternal AND t.tgtype & 1 = 1 AND t.tgtype & 2 = 2 AND t.tgtype & 4 = 4 AND t.tgtype & 16 = 16) AS v7_garde_avant_insertion_et_mise_a_jour,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worksites' AND policyname LIKE '%complet%') = 0 AS v8_aucune_regle_ajoutee,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worksites' AND cmd IN ('UPDATE', 'ALL') AND NOT (qual ILIKE '%admin%')) = 0 AS v9_aucune_regle_d_ecriture_sans_bureau;
-- ── FIN DE LA VÉRIFICATION ──
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261013180000', 'lot23_chantier_termine') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CE QUE FAIT CE FICHIER
--   1. worksites.completed_at (timestamptz) : le jour de fin, écrit à MIDI UTC
--      (le jour choisi s'affiche donc le même partout en Europe) ; NULL = en cours.
--      worksites.completed_by (uuid) : qui l'a posé. SANS clé étrangère, exprès :
--      une clé sans « suppression en cascade » bloquerait la suppression d'un compte,
--      une avec « mise à NULL » ferait perdre la trace. Ici, la trace survit.
--   2. worksite_completion_ready() : la fonction « suis-je prête ? » ; l'écran
--      l'appelle et cache TOUT (bouton, bilan) tant qu'elle manque.
--   3. set_worksite_completed(chantier, jour) : réservée au bureau DE L'ENTREPRISE
--      du chantier. Un jour => terminé à cette date (jamais dans le futur, jamais
--      d'un chantier d'une autre entreprise). NULL => rouvrir. Elle ne touche que
--      ces deux colonnes : aucune heure, aucun planning, aucun document n'est modifié.
--      Un compte support (lecture seule, lot 5) est bureau de SA propre entreprise
--      seulement : le chantier d'un client lui est « introuvable ».
--   4. guard_worksite_completion() + worksites_guard_completion : un non-bureau
--      ne peut ni poser ni changer le statut. À l'insertion (le salarié a le droit
--      d'insérer un chantier) les deux colonnes sont remises à NULL ; à la mise à
--      jour (seule l'ancienne fonction set_worksite_client_email l'atteint) elles
--      gardent leur valeur. L'éditeur SQL et la clé de service (pas d'auth.uid()) ne
--      sont pas contrôlés, comme pour les autres déclencheurs de garde.
--
-- AUCUNE règle d'accès (RLS) de worksites n'est créée, modifiée ni retirée : les
-- règles de production (lecture de l'entreprise, insertion salarié, écriture
-- bureau, lecture support) restent mot pour mot. Rejouable : IF NOT EXISTS / OR REPLACE.

-- ── 1) Le statut ────────────────────────────────────────────────────────────
ALTER TABLE public.worksites ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.worksites ADD COLUMN IF NOT EXISTS completed_by uuid;
COMMENT ON COLUMN public.worksites.completed_at IS 'Lot 23 : jour de fin du chantier (écrit à midi UTC), posé par le bureau seulement. NULL = en cours. Un chantier terminé reste actif : il n''est plus proposé au salarié pour une nouvelle intervention.';
COMMENT ON COLUMN public.worksites.completed_by IS 'Lot 23 : qui a marqué le chantier terminé (auth.uid()). Sans clé étrangère : la trace survit au compte.';

-- ── 2) « Suis-je prête ? » ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.worksite_completion_ready()
 RETURNS boolean
 LANGUAGE sql STABLE
 SET search_path TO ''
AS $fn$ SELECT true $fn$;
REVOKE ALL ON FUNCTION public.worksite_completion_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worksite_completion_ready() TO authenticated;

-- ── 3) Terminer / rouvrir : le bureau seulement ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_worksite_completed(p_worksite uuid, p_date date DEFAULT NULL)
 RETURNS timestamptz
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_today   date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_at      timestamptz;
BEGIN
  -- « Bureau » = admin actif ; is_admin() n'est pas limitée à une entreprise, on la couple au chantier.
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau de l''entreprise.' USING ERRCODE = '42501';
  END IF;
  v_company := public.get_my_company_id();
  IF p_worksite IS NULL OR v_company IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.worksites w WHERE w.id = p_worksite AND w.company_id = v_company) THEN
    RAISE EXCEPTION 'Chantier introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF p_date IS NOT NULL AND p_date > v_today THEN
    RAISE EXCEPTION 'La date de fin ne peut pas être dans le futur.' USING ERRCODE = '22023';
  END IF;

  -- Midi UTC : le même jour à l'affichage, de Paris à Lisbonne.
  v_at := CASE WHEN p_date IS NULL THEN NULL ELSE (p_date + time '12:00')::timestamp AT TIME ZONE 'UTC' END;
  UPDATE public.worksites
     SET completed_at = v_at,
         completed_by = CASE WHEN v_at IS NULL THEN NULL ELSE v_uid END
   WHERE id = p_worksite AND company_id = v_company;
  RETURN v_at;
END;
$fn$;
REVOKE ALL ON FUNCTION public.set_worksite_completed(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_worksite_completed(uuid, date) TO authenticated;

-- ── 4) Le garde : un non-bureau ne pose jamais le statut ───────────────────
CREATE OR REPLACE FUNCTION public.guard_worksite_completion()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  -- Éditeur SQL / clé de service : personne de connecté, pas de contrôle.
  IF auth.uid() IS NULL THEN RETURN new; END IF;
  IF public.is_admin() THEN RETURN new; END IF;
  IF TG_OP = 'INSERT' THEN
    new.completed_at := NULL;
    new.completed_by := NULL;
  ELSE
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  END IF;
  RETURN new;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_worksite_completion() FROM PUBLIC, anon, authenticated;

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'worksites_guard_completion' AND tgrelid = 'public.worksites'::regclass) THEN
    CREATE TRIGGER worksites_guard_completion BEFORE INSERT OR UPDATE ON public.worksites
      FOR EACH ROW EXECUTE FUNCTION public.guard_worksite_completion();
  END IF;
END $do$;
