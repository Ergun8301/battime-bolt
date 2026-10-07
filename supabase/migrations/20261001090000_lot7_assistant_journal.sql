-- Lot 7 — IA v2 : journal des actions de l'Assistant BEMEXO, bureau ET salarié.
--
-- 100 % ADDITIF : une table neuve, une fonction neuve. La table du lot 3 bis
-- (`assistant_actions`) et sa fonction ne sont PAS touchées : sa liste d'actions
-- est figée par une contrainte CHECK qu'on ne pourrait élargir qu'en la
-- supprimant — interdit. Les actions du lot 7 (tous les boutons, les
-- annulations, le côté salarié) sont donc notées ici.
--
-- Qui, quoi, quand : l'entreprise et l'auteur sont lus dans la SESSION, jamais
-- reçus de l'écran. Lecture : le bureau de l'entreprise (tout), le salarié
-- (seulement SES lignes). Aucune modification ni suppression, pour personne.

CREATE TABLE IF NOT EXISTS public.assistant_journal (
  id         bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL,
  side       text NOT NULL CHECK (side IN ('bureau', 'salarie')),
  at         timestamptz NOT NULL DEFAULT now(),
  action     text NOT NULL CHECK (action ~ '^[a-z_]{3,40}$'),
  undone     boolean NOT NULL DEFAULT false,
  summary    text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 400)
);
CREATE INDEX IF NOT EXISTS assistant_journal_company ON public.assistant_journal (company_id, at DESC);

ALTER TABLE public.assistant_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_journal FROM anon, authenticated;
GRANT SELECT ON public.assistant_journal TO authenticated;
GRANT ALL ON public.assistant_journal TO service_role;

DROP POLICY IF EXISTS assistant_journal_read ON public.assistant_journal;
CREATE POLICY assistant_journal_read ON public.assistant_journal
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR actor_id = auth.uid()));

-- Seul chemin d'écriture. `p_undone` : l'utilisateur a appuyé sur « Annuler ».
CREATE OR REPLACE FUNCTION public.assistant_journal_log(p_action text, p_summary text, p_undone boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid := public.get_my_company_id();
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Session invalide.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company AND ai_enabled) THEN
    RAISE EXCEPTION 'Assistant non activé.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.assistant_journal (company_id, actor_id, side, action, undone, summary)
  VALUES (v_company, auth.uid(), CASE WHEN public.is_admin() THEN 'bureau' ELSE 'salarie' END,
          p_action, coalesce(p_undone, false), left(trim(p_summary), 400));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.assistant_journal_log(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_journal_log(text, text, boolean) TO authenticated;
