-- 2026-06-26 — Réserves (réception de chantier) portées par l'intervention.
--
-- Le salarié déclare, sur son intervention, si le client a émis des réserves :
--   reception = NULL (non renseigné) | 'sans' (sans réserve) | 'avec' (avec réserve).
-- Le détail des réserves réutilise le champ `observation` déjà existant ; les
-- photos passent par le module Documents du chantier déjà en place.
--
-- Sûr : colonne additive, NULL par défaut → aucune intervention existante n'est
-- modifiée. N'affecte PAS la paie (l'export lit des colonnes figées) ni la
-- synchro. Le salarié met à jour sa propre ligne via la policy UPDATE existante.

ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS reception text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_reception_check') THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_reception_check
      CHECK (reception IS NULL OR reception IN ('sans', 'avec'));
  END IF;
END $$;
