-- 2026-07-26 — Chantier 4 : congés en libre-service + notifications push.
--
-- 1) `leave_requests` : demandes de congé faites par le SALARIÉ. Table SÉPARÉE de
--    `planning` — on ne touche pas à la logique d'absence existante (absence_type),
--    qui reste écrite uniquement par l'admin. À l'approbation, l'admin réutilise
--    exactement le même chemin d'écriture qu'aujourd'hui (INSERT planning avec
--    absence_type) : une fois approuvée, une demande est indistinguable d'une
--    absence posée à la main → rien d'autre dans l'app n'a besoin de changer.
--
-- 2) `push_subscriptions` : abonnements Web Push (endpoint + clés) par utilisateur
--    et par appareil. Un salarié peut avoir plusieurs appareils.
--
-- 3) Deux RPC SECURITY DEFINER, sur le modèle de `ensure_planning_slot` :
--    - request_leave()      : le salarié crée SA demande (jamais celle d'un autre).
--    - save_push_subscription() : enregistre l'abonnement push de l'appelant.
--    Les décisions (approuver/refuser) passent par la RLS admin classique, pas par
--    une RPC : l'admin écrit déjà dans `planning` avec sa propre session.

-- ── 1) Demandes de congé ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- mêmes types que planning.absence_type (le salarié ne demande jamais 'repos')
  type text NOT NULL CHECK (type IN ('conge', 'maladie', 'intemperie')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS leave_requests_company_idx ON public.leave_requests(company_id);
CREATE INDEX IF NOT EXISTS leave_requests_user_idx ON public.leave_requests(user_id);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON public.leave_requests(company_id, status);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Le salarié voit SES demandes ; l'admin voit toutes celles de son entreprise.
DROP POLICY IF EXISTS leave_requests_select ON public.leave_requests;
CREATE POLICY leave_requests_select ON public.leave_requests FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));

-- Seul l'admin décide (approuve / refuse).
DROP POLICY IF EXISTS leave_requests_admin_update ON public.leave_requests;
CREATE POLICY leave_requests_admin_update ON public.leave_requests FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());

-- Le salarié peut annuler une demande encore en attente ; l'admin peut supprimer.
DROP POLICY IF EXISTS leave_requests_delete ON public.leave_requests;
CREATE POLICY leave_requests_delete ON public.leave_requests FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND (public.is_admin() OR (user_id = auth.uid() AND status = 'pending')));

-- Pas de politique INSERT : la création passe uniquement par request_leave() ci-dessous,
-- qui force company_id/user_id côté serveur (le salarié ne peut pas viser quelqu'un d'autre).
CREATE OR REPLACE FUNCTION public.request_leave(
  p_type text, p_start_date date, p_end_date date, p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_company uuid; v_id uuid;
BEGIN
  IF p_type NOT IN ('conge', 'maladie', 'intemperie') THEN
    RAISE EXCEPTION 'Type de demande invalide';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La date de fin est avant le début';
  END IF;
  SELECT company_id INTO v_company FROM public.users WHERE id = auth.uid();
  IF v_company IS NULL THEN RAISE EXCEPTION 'Profil introuvable'; END IF;

  INSERT INTO public.leave_requests (company_id, user_id, type, start_date, end_date, note)
  VALUES (v_company, auth.uid(), p_type, p_start_date, p_end_date, NULLIF(btrim(coalesce(p_note, '')), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.request_leave(text, date, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_leave(text, date, date, text) TO authenticated;

-- ── 2) Abonnements Web Push ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_company_idx ON public.push_subscriptions(company_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Chacun ne voit/supprime QUE ses propres abonnements (un abonnement push est un
-- identifiant d'appareil : même l'admin n'a aucune raison de lire ceux des autres).
DROP POLICY IF EXISTS push_subscriptions_own_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_own_select ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_own_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_own_delete ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_company uuid;
BEGIN
  IF coalesce(btrim(p_endpoint), '') = '' THEN RAISE EXCEPTION 'Endpoint manquant'; END IF;
  SELECT company_id INTO v_company FROM public.users WHERE id = auth.uid();
  IF v_company IS NULL THEN RAISE EXCEPTION 'Profil introuvable'; END IF;

  -- Un même appareil peut se ré-abonner (nouvelle clé) : on met à jour en place,
  -- et on réattribue la ligne si l'appareil change de compte (téléphone partagé).
  INSERT INTO public.push_subscriptions (company_id, user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_company, auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_id = EXCLUDED.user_id, company_id = EXCLUDED.company_id,
        user_agent = EXCLUDED.user_agent;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;
