-- Taux horaire (coût chargé) par salarié, pour le calcul du coût main d'œuvre
-- par chantier (Chantier 2 — Heures & coût). Colonne additive, nullable :
-- NULL = non renseigné (les heures s'affichent, le coût reste « à compléter »).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hourly_rate numeric;

COMMENT ON COLUMN public.users.hourly_rate IS
  'Taux horaire (coût chargé) pour le calcul du coût main d''oeuvre par chantier. NULL = non renseigné.';
