-- ═════════════════════════════════════════════════════════════════════════════
-- ZONES D'INDEMNITÉS BTP (petits déplacements) — oct. 2026
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI : dans le bâtiment, l'ouvrier a des indemnités de petits déplacements
-- selon la distance à vol d'oiseau entre le point de départ (siège, dépôt) et le
-- chantier. BEMEXO place les adresses une fois (API Adresse de l'État, appelée
-- par le navigateur du bureau), calcule la zone et l'affiche dans la feuille
-- d'heures et l'export de paie. Rien à saisir à l'inscription.
--
-- 100 % ADDITIF : deux tables neuves, leurs règles. Aucune table, policy,
-- fonction ni donnée existante n'est touchée.
--   · btp_settings : le réglage « Indemnités BTP » de l'entreprise (ÉTEINT par
--     défaut : une entreprise sans ligne = éteint), le point de départ, les
--     limites des zones, les montants (vides par défaut, aide au calcul).
--   · worksite_geo : la position d'un chantier, géocodée UNE fois par adresse
--     (geocoded_for = l'adresse placée ; si elle change, on replace).
-- Lecture et écriture : le BUREAU seulement (administrateur actif de SON
-- entreprise). Le salarié et le chef d'équipe ne lisent rien.
--
-- AVANT CE FICHIER : l'application marche comme avant (lecture en échec →
-- réglage caché, aucune colonne « Zone »).
--
-- RETOUR ARRIÈRE (ne touche à aucune heure, aucun panier) :
--   DROP TABLE IF EXISTS public.worksite_geo;
--   DROP TABLE IF EXISTS public.btp_settings;
--
-- VÉRIFICATION APRÈS APPLICATION (lecture seule, une ligne : true | true | 4 | 4) :
--   SELECT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.btp_settings'::regclass),
--          (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.worksite_geo'::regclass),
--          (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'btp_settings'),
--          (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worksite_geo');
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261022090000', 'zones_btp') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.btp_settings (
  company_id          uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled             boolean NOT NULL DEFAULT false,
  -- Point de départ : null = l'adresse de l'entreprise (siège). Sinon un dépôt, une agence.
  origin_address      text CHECK (origin_address IS NULL OR length(origin_address) <= 300),
  origin_latitude     double precision CHECK (origin_latitude IS NULL OR origin_latitude BETWEEN -90 AND 90),
  origin_longitude    double precision CHECK (origin_longitude IS NULL OR origin_longitude BETWEEN -180 AND 180),
  origin_geocoded_for text,
  -- Limite haute des zones 1A, 1B, 2, 3, 4, 5 (km). Au-delà : grand déplacement.
  limits_km           numeric[] NOT NULL DEFAULT '{5,10,20,30,40,50}'
                      CHECK (array_length(limits_km, 1) = 6),
  -- { "trajet": { "1A": 0.79, … }, "transport": { … }, "panier": 11.5 } — vide par défaut.
  amounts             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(amounts) = 'object'),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.worksite_geo (
  worksite_id  uuid PRIMARY KEY REFERENCES public.worksites(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  geocoded_for text NOT NULL CHECK (length(geocoded_for) <= 400),
  -- null = adresse introuvable (on ne réessaie qu'à la prochaine modification de l'adresse).
  latitude     double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude    double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  label        text CHECK (label IS NULL OR length(label) <= 300),
  score        real,
  geocoded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worksite_geo_company_idx ON public.worksite_geo (company_id);

COMMENT ON TABLE public.btp_settings IS 'Réglage « Indemnités BTP » (petits déplacements) : éteint par défaut. Bureau seulement.';
COMMENT ON TABLE public.worksite_geo IS 'Position d''un chantier, géocodée une fois par adresse (API Adresse). Bureau seulement.';

ALTER TABLE public.btp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksite_geo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btp_settings FROM PUBLIC, anon;
REVOKE ALL ON public.worksite_geo FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.btp_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksite_geo TO authenticated;
GRANT ALL ON public.btp_settings TO service_role;
GRANT ALL ON public.worksite_geo TO service_role;

DROP POLICY IF EXISTS btp_settings_select ON public.btp_settings;
CREATE POLICY btp_settings_select ON public.btp_settings FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());
DROP POLICY IF EXISTS btp_settings_insert ON public.btp_settings;
CREATE POLICY btp_settings_insert ON public.btp_settings FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());
DROP POLICY IF EXISTS btp_settings_update ON public.btp_settings;
CREATE POLICY btp_settings_update ON public.btp_settings FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());
DROP POLICY IF EXISTS btp_settings_delete ON public.btp_settings;
CREATE POLICY btp_settings_delete ON public.btp_settings FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- Le chantier doit être de la MÊME entreprise (on ne place pas le chantier d'un autre).
DROP POLICY IF EXISTS worksite_geo_select ON public.worksite_geo;
CREATE POLICY worksite_geo_select ON public.worksite_geo FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());
DROP POLICY IF EXISTS worksite_geo_insert ON public.worksite_geo;
CREATE POLICY worksite_geo_insert ON public.worksite_geo FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin()
    AND EXISTS (SELECT 1 FROM public.worksites w WHERE w.id = worksite_geo.worksite_id AND w.company_id = worksite_geo.company_id));
DROP POLICY IF EXISTS worksite_geo_update ON public.worksite_geo;
CREATE POLICY worksite_geo_update ON public.worksite_geo FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin()
    AND EXISTS (SELECT 1 FROM public.worksites w WHERE w.id = worksite_geo.worksite_id AND w.company_id = worksite_geo.company_id));
DROP POLICY IF EXISTS worksite_geo_delete ON public.worksite_geo;
CREATE POLICY worksite_geo_delete ON public.worksite_geo FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());
