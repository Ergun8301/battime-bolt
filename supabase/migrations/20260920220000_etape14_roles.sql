-- 2026-09-20 — Étape 14 : les rôles, et l'entreprise qu'on ne peut plus perdre.
--
-- TROIS PROBLÈMES CONSTATÉS SUR LA BASE DE PRODUCTION, PAS DÉDUITS.
--
-- 1) `is_admin()` ne regardait pas si le compte est actif. Un administrateur
--    archivé continuait de répondre « oui, je suis admin ». Vérifié : en
--    archivant l'admin puis en appelant la fonction sous son identité, elle
--    renvoie VRAI. Les policies le rattrapaient de justesse parce qu'elles
--    exigent aussi `get_my_company_id()`, qui, elle, filtre les archivés —
--    autrement dit la sécurité tenait à un effet de bord d'une AUTRE fonction.
--
-- 2) Le seul administrateur pouvait se rétrograder lui-même. Vérifié : après
--    l'opération, il reste ZÉRO admin actif dans l'entreprise. Plus personne ne
--    peut inviter, exporter la paie, clôturer un mois, ni même rendre le rôle à
--    quelqu'un. L'entreprise est perdue sans intervention en base. Même chose en
--    s'archivant soi-même, ou en se supprimant.
--
-- 3) Aucun moyen de nommer une deuxième personne au bureau. Une entreprise a un
--    seul administrateur : celui qui a créé le compte. Si le patron est sur un
--    toit, personne ne sort la paie. Il n'existait pas d'écran pour ça, et la
--    liste « Salariés » ne montre que les `worker` — une personne promue en SQL
--    disparaissait de l'écran et ne pouvait plus être rétrogradée.
--
-- À exécuter AVANT de fusionner la PR.

-- ── 1) Un compte archivé n'est plus administrateur ────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
      -- La condition qui manquait. Un jeton reste valide quelques minutes après
      -- l'archivage : sans ça, le compte garde ses pouvoirs pendant ce temps.
      AND is_active IS DISTINCT FROM false
  );
$fn$;

-- ── 2) Une entreprise garde toujours un administrateur actif ──────────────
-- Invariant tenu par la BASE, pas par l'écran : il vaut pour la nouvelle
-- fonction de changement de rôle, pour le bouton « Archiver » qui existait
-- déjà, et pour n'importe quelle requête directe.
CREATE OR REPLACE FUNCTION public.guard_last_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_was_active_admin boolean;
  v_still_admin boolean;
  v_others int;
BEGIN
  v_was_active_admin := old.role::text = 'admin' AND old.is_active IS DISTINCT FROM false;
  IF NOT v_was_active_admin THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
  END IF;

  v_still_admin := TG_OP <> 'DELETE'
                   AND new.role::text = 'admin'
                   AND new.is_active IS DISTINCT FROM false;
  IF v_still_admin THEN
    RETURN new;
  END IF;

  -- UN SEUL retrait à la fois pour cette entreprise.
  --
  -- Sans ce verrou, deux retraits simultanés se croisent : en lecture validée,
  -- chaque transaction voit encore l'administrateur que l'AUTRE est en train de
  -- retirer. Les deux comptent « il en reste un », les deux passent, et
  -- l'entreprise se retrouve sans personne — précisément l'état irrécupérable
  -- que ce garde existe pour empêcher. Le compte ci-dessous n'a de valeur que
  -- pris sous le verrou.
  --
  -- 4314 est un numéro de famille arbitraire mais fixe : il évite de se
  -- disputer inutilement un verrou avec une autre partie du code qui hacherait
  -- un identifiant différent vers la même valeur.
  PERFORM pg_advisory_xact_lock(4314, hashtext(old.company_id::text));

  SELECT count(*) INTO v_others
  FROM public.users u
  WHERE u.company_id = old.company_id
    AND u.id <> old.id
    AND u.role::text = 'admin'
    AND u.is_active IS DISTINCT FROM false;

  IF v_others = 0 THEN
    RAISE EXCEPTION 'Votre entreprise doit garder au moins un administrateur actif. Nommez quelqu''un d''autre avant.';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_last_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_guard_last_admin ON public.users;
CREATE TRIGGER users_guard_last_admin
  BEFORE UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

-- ── 3) Changer le rôle de quelqu'un ───────────────────────────────────────
-- Par une fonction serveur plutôt qu'un UPDATE direct : l'entreprise vient de
-- la session et non de la requête, le rôle demandé est validé, et un refus dit
-- pourquoi au lieu de renvoyer « 0 ligne modifiée » sans erreur.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid;
  v_target_company uuid;
  v_active boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de l''entreprise';
  END IF;
  IF p_role NOT IN ('admin', 'worker') THEN
    RAISE EXCEPTION 'Rôle inconnu';
  END IF;

  v_company := public.get_my_company_id();
  SELECT u.company_id, u.is_active IS DISTINCT FROM false
    INTO v_target_company, v_active
  FROM public.users u WHERE u.id = p_user_id;

  IF v_target_company IS NULL OR v_target_company <> v_company THEN
    RAISE EXCEPTION 'Personne introuvable dans votre entreprise';
  END IF;
  -- Nommer au bureau quelqu'un d'archivé donnerait un administrateur qui ne
  -- peut pas se connecter : la place paraîtrait pourvue et ne le serait pas.
  IF p_role = 'admin' AND NOT v_active THEN
    RAISE EXCEPTION 'Ce compte est archivé. Réactivez-le avant de le nommer au bureau.';
  END IF;

  -- Le garde ci-dessus refuse le cas « dernier administrateur ».
  UPDATE public.users SET role = p_role::public.battime_role WHERE id = p_user_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- Contrôle :
-- SELECT
--   (SELECT prosrc LIKE '%is_active%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='is_admin') AS is_admin_filtre_les_archives,
--   (SELECT count(*) FROM pg_trigger WHERE tgname='users_guard_last_admin') AS garde_dernier_admin,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='set_user_role') AS rpc_role;
