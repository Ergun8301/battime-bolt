-- ════════════════════════════════════════════════════════════════════════════
-- LOT 3 BIS — L'ASSISTANT QUI AGIT : JOURNAL DES ACTIONS
--
-- L'assistant PRÉPARE une action (inviter un salarié, créer un chantier, poser
-- une absence, affecter quelqu'un, proposer le planning, corriger un
-- pointage). Le patron CONFIRME. L'écran l'exécute alors avec SES droits, par
-- les mêmes chemins que l'interface (mêmes tables, mêmes RPC, même RLS).
--
-- Cette migration n'ajoute QUE la trace : qui, quoi, quand. Rien d'autre.
--
-- 100 % ADDITIF : une table neuve, une fonction neuve. Aucune policy ni
-- fonction existante touchée. Pas de suppression en v1 : l'assistant n'a
-- aucune action de suppression, et ce journal ne se modifie pas.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.assistant_actions (
  id         bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  action     text NOT NULL CHECK (action IN (
               'inviter_salarie', 'creer_chantier', 'poser_absence',
               'affecter_planning', 'appliquer_planning_semaine', 'corriger_pointage')),
  summary    text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 400)
);
CREATE INDEX IF NOT EXISTS assistant_actions_company ON public.assistant_actions (company_id, at DESC);

ALTER TABLE public.assistant_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_actions FROM anon, authenticated;
GRANT SELECT ON public.assistant_actions TO authenticated;
GRANT ALL ON public.assistant_actions TO service_role;

DROP POLICY IF EXISTS assistant_actions_admin_read ON public.assistant_actions;
CREATE POLICY assistant_actions_admin_read ON public.assistant_actions
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- Seul chemin d'écriture : l'entreprise et l'auteur sont lus dans la SESSION,
-- jamais reçus de l'écran. Réservé à un admin actif d'une entreprise `ai_enabled`.
CREATE OR REPLACE FUNCTION public.assistant_log_action(p_action text, p_summary text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid := public.get_my_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company AND ai_enabled) THEN
    RAISE EXCEPTION 'Assistant non activé.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.assistant_actions (company_id, actor_id, action, summary)
  VALUES (v_company, auth.uid(), p_action, left(trim(p_summary), 400));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.assistant_log_action(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_log_action(text, text) TO authenticated;

-- Contrôle :
-- SELECT count(*) FROM pg_policies WHERE tablename = 'assistant_actions';  -- 1
