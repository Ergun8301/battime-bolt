-- ═════════════════════════════════════════════════════════════════════════════
-- Lot 7 sécurité, oct. 2026 — UN INVITÉ REJOINT L'ENTREPRISE QUI L'A INVITÉ,
-- ET AUCUNE AUTRE
-- (sans rapport avec les migrations « lot7 » de l'assistant du 1er octobre)
-- ═════════════════════════════════════════════════════════════════════════════
-- PAS ENCORE APPLIQUÉE EN PRODUCTION : Cowork la relit et l'applique. Testée sur
-- un Postgres jetable : npm run test:invitation-entreprise
-- (supabase/tests/lot7_invitation_entreprise.mjs), qui rejoue aussi l'attaque
-- sur les fonctions de production et le RETOUR ARRIÈRE plus bas.
--
-- ⚠ LA SEULE EXCEPTION À « AJOUT SEULEMENT » : 3 × CREATE OR REPLACE FUNCTION
-- (handle_new_user, handle_first_sign_in, pending_invitations_sent_at) avec les
-- MÊMES signatures, le même propriétaire et les mêmes droits (redits à la fin).
-- C'est la correction elle-même : les triggers on_auth_user_created et
-- on_auth_user_first_sign_in restent tels quels (aucun DROP / CREATE TRIGGER sur
-- auth.users), seules les fonctions qu'ils appellent changent. Le reste est un
-- ajout pur : 3 policies RESTRICTIVES neuves sur invitations. Aucune table,
-- colonne, policy existante, trigger ni donnée touchée. Retour arrière testé,
-- avec les trois corps de production recopiés en fin de fichier.
--
-- LE PROBLÈME. handle_new_user (AFTER INSERT ON auth.users) rattachait un
-- compte sans nom d'entreprise à « l'invitation en attente la plus récente pour
-- cette adresse », SANS REGARDER QUELLE ENTREPRISE l'avait posée. Or le bureau
-- peut écrire une ligne d'invitation directement par l'API (policy
-- invitations_admin_manage), y compris une date de création dans le futur.
-- L'entreprise B pose donc une invitation pour l'adresse d'un salarié que A
-- s'apprête à inviter : quand A l'invite (invite-worker → inviteUserByEmail →
-- INSERT auth.users), le trigger prend l'invitation de B. La personne reçoit
-- « A vous invite », crée son mot de passe… et arrive chez B, qui voit son
-- planning, ses heures, sa position au pointage. A ne peut plus l'inviter
-- (« Un compte existe déjà »). Sans date truquée, il suffit que B écrive sa
-- ligne entre celle de A et la création du compte.
-- Même défaut, plus discret, dans handle_first_sign_in : à la première
-- connexion, TOUTES les invitations en attente de l'adresse étaient marquées
-- acceptées, celles des autres entreprises comprises. Et
-- pending_invitations_sent_at montrait à B la date d'envoi d'un compte de A.
--
-- LA RÈGLE :
--   · nom d'entreprise dans les métadonnées (/inscription) : une NOUVELLE
--     entreprise, comme avant. Aucune invitation n'est lue ni consommée ;
--   · sinon, l'entreprise est celle de l'invitation que le SERVEUR a envoyée :
--     invite-worker pose company_id (celle de l'administrateur appelant) dans
--     les métadonnées. Le compte n'est créé que si CETTE entreprise a une
--     invitation en attente, non expirée, pour CETTE adresse exacte. Jamais de
--     repli sur l'invitation d'une autre entreprise : pas de company_id, ou pas
--     d'invitation de cette entreprise → refus (le compte n'est pas créé ;
--     le message cite l'entreprise et le compte, jamais l'adresse) ;
--   · plusieurs entreprises ont invité la même adresse : c'est l'invitation
--     ENVOYÉE qui décide (son company_id), plus la date de création ;
--   · un invité est toujours salarié (role des métadonnées ignoré, comme avant) ;
--   · première connexion : seules les invitations de SON entreprise passent
--     « acceptées » ;
--   · « dates d'envoi » du bureau : une invitation d'une entreprise ne montre
--     plus la date d'envoi d'un compte qui appartient à une autre ;
--   · une invitation ne s'écrit plus que côté serveur (bloc 4, OBLIGATOIRE).
--
-- POURQUOI company_id DANS LES MÉTADONNÉES SUFFIT — AVEC LE BLOC 4. Une
-- inscription publique (signUp avec la clé anon) peut écrire n'importe quelle
-- métadonnée. Elle n'obtient au mieux que ce qu'une vraie invitation de cette
-- entreprise aurait donné : il faut une invitation en attente de CETTE
-- entreprise pour CETTE adresse, et « Confirmer l'adresse e-mail » est actif
-- (sans la boîte mail, on ne se connecte pas). Cela ne tient QUE si personne ne
-- peut poser une invitation à la main : sans le bloc 4, B pose une ligne par
-- l'API puis inscrit l'adresse avec {company_id: B} — le compte naît chez B et
-- A est bloquée (prouvé par le test, scénario « SANS BLOC 4 »). Le bloc 4 fait
-- donc partie de la correction : ne pas l'enlever. Une adresse déjà inscrite ne
-- repasse jamais par ce trigger (GoTrue ne recrée pas le compte).
--
-- À SAVOIR (outils d'exploitation). Un compte créé sans company_id dans les
-- métadonnées est désormais REFUSÉ (avant : rattaché par la seule adresse).
-- Cela vise le tableau de bord Supabase (« Invite user », « Add user ») et les
-- scripts auth.admin.createUser comme « préparer une équipe sans e-mail » (8 oct.).
-- Recette, côté serveur (service_role), DANS CET ORDRE :
--   1) la ligne d'invitation d'abord :
--        INSERT INTO public.invitations (company_id, email, first_name, last_name, role)
--        VALUES ('<uuid de l''entreprise>', '<adresse>', '<prénom>', '<nom>', 'worker');
--   2) puis le compte, avec la MÊME entreprise :
--        auth.admin.createUser({ email, email_confirm: false,
--          user_metadata: { first_name, last_name, company_id: '<uuid de l''entreprise>' } })
-- Les comptes existants ne sont pas concernés (le trigger ne joue qu'à la
-- création), ni les renvois d'invitation (GoTrue renvoie au compte existant).
--
-- AVANT D'APPLIQUER — LECTURE SEULE, une ligne de résultat, toutes les colonnes
-- à 0 le 10/10/2026. Un chiffre ≠ 0 n'empêche pas d'appliquer (la migration ne
-- touche aucune donnée et ferme la faille) mais c'est une trace à examiner : le
-- noter. n1, n2, n4 et n5 sont exactement les traces que laisse l'attaque.
-- SELECT
--   (SELECT count(*) FROM public.invitations WHERE created_at > now()) AS n1_invitation_datee_du_futur,
--   (SELECT count(*) FROM (SELECT 1 FROM public.invitations WHERE accepted_at IS NULL GROUP BY lower(email) HAVING count(DISTINCT company_id) > 1) t) AS n2_adresse_en_attente_dans_plusieurs_entreprises,
--   (SELECT count(*) FROM public.invitations i WHERE i.accepted_at IS NULL AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = lower(i.email))) AS n3_invitation_en_attente_sans_compte,
--   (SELECT count(*) FROM public.invitations i JOIN auth.users au ON lower(au.email) = lower(i.email) JOIN public.users pu ON pu.id = au.id WHERE i.accepted_at IS NULL AND pu.company_id <> i.company_id) AS n4_invitation_en_attente_compte_dans_une_autre_entreprise,
--   (SELECT count(*) FROM auth.users au JOIN public.users pu ON pu.id = au.id WHERE au.raw_user_meta_data ? 'company_id' AND lower(btrim(au.raw_user_meta_data ->> 'company_id')) IS DISTINCT FROM pu.company_id::text) AS n5_compte_invite_par_une_entreprise_profil_dans_une_autre,
--   (SELECT count(*) FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id)) AS n6_compte_sans_profil;

-- ── 1) Création du compte ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_first_name text;
  v_last_name text;
  v_role public.battime_role;
  v_inv public.invitations%ROWTYPE;
  v_invited_by text;
BEGIN
  v_first_name := nullif(new.raw_user_meta_data ->> 'first_name', '');
  v_last_name  := nullif(new.raw_user_meta_data ->> 'last_name', '');
  v_company_name := nullif(new.raw_user_meta_data ->> 'company_name', '');

  IF v_company_name IS NOT NULL THEN
    -- Inscription publique (/inscription) : crée TOUJOURS une nouvelle
    -- entreprise. Aucune invitation n'est lue ici.
    INSERT INTO public.companies (name, trial_ends_at)
    VALUES (v_company_name, now() + interval '30 days')
    RETURNING id INTO v_company_id;
    v_role := 'admin'::public.battime_role;
    INSERT INTO public.worksites (company_id, client_name, city, is_active)
    VALUES (v_company_id, 'Autre', '', true);
  ELSE
    -- Invité : l'entreprise est celle qui a ENVOYÉ l'invitation (company_id
    -- posé par invite-worker, côté serveur). Elle doit avoir une invitation en
    -- attente pour cette adresse exacte. Jamais celle d'une autre entreprise.
    v_invited_by := lower(btrim(coalesce(new.raw_user_meta_data ->> 'company_id', '')));
    IF v_invited_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'handle_new_user: compte % sans entreprise d''invitation (ni nom d''entreprise)', new.id;
    END IF;

    SELECT i.* INTO v_inv
    FROM public.invitations i
    WHERE i.company_id = v_invited_by::uuid
      AND lower(i.email) = lower(new.email)
      AND i.accepted_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at > now())
    ORDER BY i.created_at DESC NULLS LAST, i.id DESC
    LIMIT 1;
    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: aucune invitation en attente de l''entreprise % pour le compte %', v_invited_by, new.id;
    END IF;

    v_company_id := v_inv.company_id;
    -- Un invité est toujours un salarié (étape 11 : rôle porté par l'invitation).
    v_role := 'worker'::public.battime_role;
    v_first_name := COALESCE(v_first_name, v_inv.first_name);
    v_last_name  := COALESCE(v_last_name, v_inv.last_name);
  END IF;

  INSERT INTO public.users (id, company_id, first_name, last_name, role, email, phone)
  VALUES (
    new.id, v_company_id, v_first_name, v_last_name, v_role,
    nullif(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );
  RETURN new;
END;
$function$;

-- ── 2) Première connexion : seules les invitations de SON entreprise ─────────
CREATE OR REPLACE FUNCTION public.handle_first_sign_in()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF old.last_sign_in_at IS NULL AND new.last_sign_in_at IS NOT NULL THEN
    UPDATE public.invitations i
    SET accepted_at = now()
    WHERE lower(i.email) = lower(new.email)
      AND i.accepted_at IS NULL
      AND i.company_id = (SELECT u.company_id FROM public.users u WHERE u.id = new.id);
  END IF;
  RETURN new;
END;
$function$;

-- ── 3) Dates d'envoi (bureau) : seulement les comptes de SON entreprise ──────
CREATE OR REPLACE FUNCTION public.pending_invitations_sent_at()
 RETURNS TABLE (email text, invited_at timestamptz)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT i.email, au.invited_at
  FROM public.invitations i
  JOIN auth.users au ON lower(au.email) = lower(i.email)
  JOIN public.users pu ON pu.id = au.id AND pu.company_id = i.company_id
  WHERE i.accepted_at IS NULL
    AND i.company_id = (
      SELECT u.company_id
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role = 'admin'::public.battime_role
        AND coalesce(u.is_active, true)
    );
$function$;

-- ── 4) OBLIGATOIRE : une invitation ne s'écrit que côté serveur ──────────────
-- L'application n'écrit JAMAIS une invitation avec le jeton d'un utilisateur :
-- seule la fonction invite-worker (service_role, hors RLS) les crée, les
-- renvoie et les annule ; les triggers ci-dessus tournent avec les droits du
-- propriétaire (postgres, hors RLS). Ces trois règles RESTRICTIVES ferment
-- l'écriture directe par l'API (date de création truquée, adresse d'un salarié
-- d'une autre entreprise posée « pour voir », invitation marquée acceptée à la
-- main). La lecture du bureau (invitations_admin_manage) ne change pas : la
-- policy existante n'est pas modifiée. Sans ce bloc, le correctif ne tient pas
-- (voir « POURQUOI company_id… SUFFIT » plus haut).
DROP POLICY IF EXISTS invitations_server_only_insert ON public.invitations;
CREATE POLICY invitations_server_only_insert ON public.invitations
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
DROP POLICY IF EXISTS invitations_server_only_update ON public.invitations;
CREATE POLICY invitations_server_only_update ON public.invitations
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS invitations_server_only_delete ON public.invitations;
CREATE POLICY invitations_server_only_delete ON public.invitations
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- Droits : inchangés, redits (rejouable, et indépendant des droits par défaut).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_first_sign_in() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pending_invitations_sent_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_invitations_sent_at() TO authenticated;

-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne de résultat, toutes
-- les colonnes à true. Les md5 sont ceux que le test imprime pour CE fichier
-- (pg_get_functiondef ; ils changent si le texte des fonctions change).
-- SELECT
--   md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 'faaaf50e8fa3cdf28ebe0cc89aad7cec' AS v1_handle_new_user,
--   md5(pg_get_functiondef('public.handle_first_sign_in()'::regprocedure)) = '66fb5f30f4046ee5522e36b91823fbb1' AS v2_handle_first_sign_in,
--   md5(pg_get_functiondef('public.pending_invitations_sent_at()'::regprocedure)) = 'bbd3ca49d2604ea563e9e162fe8fd543' AS v3_pending_invitations_sent_at,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invitations' AND policyname LIKE 'invitations\_server\_only\_%' AND permissive = 'RESTRICTIVE' AND coalesce(qual, 'false') = 'false' AND coalesce(with_check, 'false') = 'false') = 3 AS v4_trois_policies_restrictives,
--   (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgenabled <> 'D' AND ((tgname = 'on_auth_user_created' AND tgfoid = 'public.handle_new_user()'::regprocedure) OR (tgname = 'on_auth_user_first_sign_in' AND tgfoid = 'public.handle_first_sign_in()'::regprocedure))) = 2 AS v5_deux_triggers_toujours_branches,
--   NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.handle_first_sign_in()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.handle_first_sign_in()', 'EXECUTE') AS v6_fonctions_de_trigger_inappelables,
--   has_function_privilege('authenticated', 'public.pending_invitations_sent_at()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.pending_invitations_sent_at()', 'EXECUTE') AS v7_dates_envoi_bureau_seulement;

-- RETOUR ARRIÈRE — remet EXACTEMENT les trois fonctions de PRODUCTION lues le
-- 10/10/2026 (pg_get_functiondef, recopiées mot pour mot ; aucun autre fichier
-- à rejouer) et retire les 3 policies. Triggers et droits ne bougent pas
-- (CREATE OR REPLACE les garde). ⚠ Remet aussi la faille.
-- Pour l'exécuter : copier les lignes ENTRE « DÉBUT » et « FIN » en retirant au
-- début de chaque ligne « -- » ET l'espace qui suit (Ctrl+/ dans l'éditeur SQL).
-- Après retour arrière, la même requête md5 doit rendre la production d'avant :
--   handle_new_user              e128b35072c8d5664366ca336ecffcb9
--   handle_first_sign_in         f4d9fec94480b923e927ecfde4b70002
--   pending_invitations_sent_at  2c6b51743ac9f39ffc04328e0a8ba391
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP POLICY IF EXISTS invitations_server_only_insert ON public.invitations;
-- DROP POLICY IF EXISTS invitations_server_only_update ON public.invitations;
-- DROP POLICY IF EXISTS invitations_server_only_delete ON public.invitations;
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- DECLARE
--   v_company_id uuid;
--   v_company_name text;
--   v_first_name text;
--   v_last_name text;
--   v_role public.battime_role;
--   v_inv public.invitations%ROWTYPE;
-- BEGIN
--   v_first_name := nullif(new.raw_user_meta_data ->> 'first_name', '');
--   v_last_name  := nullif(new.raw_user_meta_data ->> 'last_name', '');
--   v_company_name := nullif(new.raw_user_meta_data ->> 'company_name', '');
--
--   IF v_company_name IS NOT NULL THEN
--     INSERT INTO public.companies (name, trial_ends_at)
--     VALUES (v_company_name, now() + interval '30 days')
--     RETURNING id INTO v_company_id;
--     v_role := 'admin'::public.battime_role;
--     INSERT INTO public.worksites (company_id, client_name, city, is_active)
--     VALUES (v_company_id, 'Autre', '', true);
--   ELSE
--     SELECT i.* INTO v_inv
--     FROM public.invitations i
--     WHERE lower(i.email) = lower(new.email)
--       AND i.accepted_at IS NULL
--       AND (i.expires_at IS NULL OR i.expires_at > now())
--     ORDER BY i.created_at DESC
--     LIMIT 1;
--     IF v_inv.id IS NULL THEN
--       RAISE EXCEPTION 'handle_new_user: aucune invitation en attente pour % (et pas de nom d''entreprise)', new.email;
--     END IF;
--     v_company_id := v_inv.company_id;
--     v_role := 'worker'::public.battime_role;
--     v_first_name := COALESCE(v_first_name, v_inv.first_name);
--     v_last_name  := COALESCE(v_last_name, v_inv.last_name);
--   END IF;
--
--   INSERT INTO public.users (id, company_id, first_name, last_name, role, email, phone)
--   VALUES (
--     new.id, v_company_id, v_first_name, v_last_name, v_role,
--     nullif(new.email, ''),
--     nullif(new.raw_user_meta_data ->> 'phone', '')
--   );
--   RETURN new;
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.handle_first_sign_in()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- BEGIN
--   IF old.last_sign_in_at IS NULL AND new.last_sign_in_at IS NOT NULL THEN
--     UPDATE public.invitations
--     SET accepted_at = now()
--     WHERE lower(email) = lower(new.email) AND accepted_at IS NULL;
--   END IF;
--   RETURN new;
-- END;
-- $function$;
-- CREATE OR REPLACE FUNCTION public.pending_invitations_sent_at()
--  RETURNS TABLE(email text, invited_at timestamp with time zone)
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
--   select i.email, au.invited_at
--   from public.invitations i
--   join auth.users au on lower(au.email) = lower(i.email)
--   where i.accepted_at is null
--     and i.company_id = (
--       select u.company_id
--       from public.users u
--       where u.id = (select auth.uid())
--         and u.role = 'admin'::public.battime_role
--         and coalesce(u.is_active, true)
--     );
-- $function$;
-- ── FIN DU RETOUR ARRIÈRE ──
