-- ════════════════════════════════════════════════════════════════════════════
-- ASSISTANT BEMEXO (lot 3) — quota de questions par entreprise et par jour
--
-- L'assistant n'a besoin d'AUCUNE table pour répondre : il lit les données
-- existantes avec les droits du patron connecté. La seule chose stockée est un
-- COMPTEUR (entreprise, jour, nombre) pour le quota de sécurité : ni question,
-- ni réponse, ni conversation.
--
-- 100 % ADDITIF : une table neuve, une fonction neuve. Rien d'existant n'est
-- modifié. Même interrupteur que le lot 2 : `companies.ai_enabled`.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.assistant_usage (
  company_id uuid    NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day        date    NOT NULL,
  questions  integer NOT NULL DEFAULT 0 CHECK (questions >= 0),
  PRIMARY KEY (company_id, day)
);

-- Clé service uniquement : RLS active, aucune policy.
ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_usage FROM anon, authenticated;
GRANT ALL ON public.assistant_usage TO service_role;

-- Consomme une question, de façon ATOMIQUE (deux onglets en même temps ne
-- dépassent pas la limite). Renvoie le nombre de questions du jour après
-- consommation, ou NULL si la limite est atteinte (rien n'est alors compté).
CREATE OR REPLACE FUNCTION public.assistant_consume(p_company uuid, p_limit integer)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  INSERT INTO public.assistant_usage AS u (company_id, day, questions)
  SELECT p_company, (now() AT TIME ZONE 'Europe/Paris')::date, 1
  WHERE p_limit > 0
  ON CONFLICT (company_id, day) DO UPDATE SET questions = u.questions + 1
    WHERE u.questions < p_limit
  RETURNING questions;
$fn$;
REVOKE EXECUTE ON FUNCTION public.assistant_consume(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_consume(uuid, integer) TO service_role;
