-- ════════════════════════════════════════════════════════════════════════════
-- ASSISTANT BEMEXO CÔTÉ SALARIÉ (lot 4) — quota par salarié et par jour
--
-- Aucune table de pointage n'est touchée : le brouillon confirmé par le salarié
-- est enregistré par l'écran, avec SON jeton, par le même chemin que la saisie
-- manuelle (mêmes règles, mêmes statuts, même RLS). La seule chose stockée ici
-- est un COMPTEUR (salarié, jour, nombre) : ni phrase, ni réponse.
--
-- 100 % ADDITIF. Même interrupteur que les lots 2 et 3 : `companies.ai_enabled`.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.worker_assistant_usage (
  user_id  uuid    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day      date    NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.worker_assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worker_assistant_usage FROM anon, authenticated;
GRANT ALL ON public.worker_assistant_usage TO service_role;

-- Atomique ; renvoie le nombre du jour après consommation, NULL si limite atteinte.
CREATE OR REPLACE FUNCTION public.worker_assistant_consume(p_user uuid, p_limit integer)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  INSERT INTO public.worker_assistant_usage AS u (user_id, day, requests)
  SELECT p_user, (now() AT TIME ZONE 'Europe/Paris')::date, 1
  WHERE p_limit > 0
  ON CONFLICT (user_id, day) DO UPDATE SET requests = u.requests + 1
    WHERE u.requests < p_limit
  RETURNING requests;
$fn$;
REVOKE EXECUTE ON FUNCTION public.worker_assistant_consume(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_assistant_consume(uuid, integer) TO service_role;
