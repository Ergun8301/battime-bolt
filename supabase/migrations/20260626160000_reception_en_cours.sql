-- 2026-06-26 — Réserves : ajout d'un 3e statut « chantier en cours / non fini ».
--
-- reception devient : NULL | 'en_cours' | 'sans' | 'avec'.
-- Sûr : on élargit la contrainte (les valeurs existantes restent valides).

ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_reception_check;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_reception_check
  CHECK (reception IS NULL OR reception IN ('sans', 'avec', 'en_cours'));
