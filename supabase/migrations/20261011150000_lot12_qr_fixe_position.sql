-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 12 (oct. 2026) — QR FIXE IMPRIMABLE + POSITION AU SCAN
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE — le QR fixe est d'abord COUPÉ (ses lignes « fixe » reçoivent
-- revoked_at, rien n'est effacé), puis les objets neufs sont retirés. Les
-- pointages déjà faits restent (kiosk_punches garde ses lignes ; seule la
-- colonne in_zone part). Pour l'exécuter : copier les lignes ENTRE « DÉBUT » et
-- « FIN » en retirant au début de chaque ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- UPDATE public.kiosks SET revoked_at = now() WHERE kind = 'fixe' AND revoked_at IS NULL;
-- DROP INDEX IF EXISTS public.kiosks_one_fixed_qr_idx;
-- ALTER TABLE public.kiosks DROP CONSTRAINT IF EXISTS kiosks_kind_check;
-- ALTER TABLE public.kiosks DROP COLUMN IF EXISTS kind;
-- ALTER TABLE public.kiosk_punches DROP COLUMN IF EXISTS in_zone;
-- ALTER TABLE public.kiosk_settings DROP CONSTRAINT IF EXISTS kiosk_settings_fixed_qr_radius_check;
-- ALTER TABLE public.kiosk_settings DROP CONSTRAINT IF EXISTS kiosk_settings_fixed_qr_point_check;
-- ALTER TABLE public.kiosk_settings
--   DROP COLUMN IF EXISTS fixed_qr_latitude, DROP COLUMN IF EXISTS fixed_qr_longitude,
--   DROP COLUMN IF EXISTS fixed_qr_accuracy_m, DROP COLUMN IF EXISTS fixed_qr_point_at,
--   DROP COLUMN IF EXISTS fixed_qr_radius_m;
-- DROP TABLE IF EXISTS public.kiosk_ticket_failures;
-- ── FIN DU RETOUR ARRIÈRE ──
-- (Les lignes « fixe » restent dans kiosks, retirées : elles ne comptent plus
-- nulle part — company_kiosk_active ignore les bornes retirées.)
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 8 × true :
-- SELECT
--   (SELECT is_nullable = 'NO' AND column_default LIKE '''tablette''%' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosks' AND column_name = 'kind') AS v1_kind_tablette_par_defaut,
--   (SELECT count(*) FROM pg_constraint WHERE conname IN ('kiosks_kind_check', 'kiosk_settings_fixed_qr_radius_check', 'kiosk_settings_fixed_qr_point_check')) = 3 AS v2_trois_controles,
--   (SELECT indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%fixe%' FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kiosks_one_fixed_qr_idx') AS v3_un_seul_qr_fixe_actif,
--   (SELECT is_nullable = 'YES' AND data_type = 'boolean' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosk_punches' AND column_name = 'in_zone') AS v4_dans_la_zone,
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosk_settings' AND column_name IN ('fixed_qr_latitude', 'fixed_qr_longitude', 'fixed_qr_accuracy_m', 'fixed_qr_point_at', 'fixed_qr_radius_m')) = 5 AS v5_point_et_rayon,
--   (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kiosk_ticket_failures'::regclass) AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kiosk_ticket_failures') AS v6_echecs_service_seul,
--   NOT has_table_privilege('anon', 'public.kiosk_ticket_failures', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('authenticated', 'public.kiosk_ticket_failures', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v7_ni_anon_ni_compte,
--   has_column_privilege('authenticated', 'public.kiosks', 'kind', 'SELECT') AND NOT has_column_privilege('anon', 'public.kiosks', 'kind', 'SELECT') AND NOT has_column_privilege('authenticated', 'public.kiosks', 'seed_salt', 'SELECT') AS v8_bureau_lit_kind_pas_le_sel;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261011150000', 'lot12_qr_fixe_position') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI (demande d'Ergun) : pouvoir IMPRIMER depuis le bureau un QR code
-- FIXE, en option, DÉSACTIVÉ PAR DÉFAUT, « moins sécurisé », régénérable — sans
-- toucher au QR de la tablette qui change chaque minute. Le QR fixe exige la
-- POSITION au moment du scan : rayon autour de l'entreprise, lecture UNE fois,
-- jamais en continu, AUCUNE coordonnée du salarié gardée.
--
-- CE QUE FAIT LE FICHIER (100 % ADDITIF, aucun DROP, aucun DELETE) :
--   1) kiosks.kind : 'tablette' (défaut : toutes les bornes existantes) ou
--      'fixe'. Le QR fixe est UNE LIGNE de kiosks : kiosk_punches.kiosk_id
--      (obligatoire) le référence naturellement, sans relâcher aucune
--      contrainte. Au plus UN QR fixe actif par entreprise (index unique
--      partiel). La fonction kiosk : « la dernière tablette reliée gagne »
--      ne retire que les tablettes ; la fenêtre « Borne » du bureau ignore la
--      ligne fixe pour « Tablette reliée ».
--   2) kiosk_settings : le point de référence (posé une fois par le bureau,
--      depuis son téléphone, à l'endroit du QR, précision ≤ 100 m), sa
--      précision, sa date, et le rayon (200 m par défaut, de 100 à 1 000 m).
--      C'est la position de L'ENTREPRISE, pas celle d'un salarié.
--   3) kiosk_punches.in_zone : « dans la zone : oui » sur un pointage fait
--      avec le QR fixe (NULL pour la tablette). Jamais de latitude ni de
--      longitude du salarié : la position est vérifiée par la fonction kiosk
--      puis oubliée.
--   4) kiosk_ticket_failures : QR refusés par adresse (10 minutes), pour
--      plafonner les essais sur `ticket`. Clé service seule.
--
-- company_kiosk_active / company_has_kiosk (lot 12 « pointage QR ») NE SONT PAS
-- MODIFIÉES. Elles comptent toute ligne non retirée de kiosks, donc AUSSI un
-- QR fixe actif. C'est voulu : (a) l'icône du scanner apparaît chez le salarié
-- quand un QR fixe est actif ; (b) la règle « avec un QR à scanner, la journée
-- COMMENCE par un scan » s'applique au QR fixe comme à la tablette (le chrono
-- du téléphone n'est de toute façon plus proposé à l'écran depuis le lot 12) ;
-- (c) la saisie à la main (« + ») n'est JAMAIS bloquée : elle n'écrit pas de
-- chrono. Désactiver le QR fixe (revoked_at) le retire aussitôt de ce calcul.
--
-- DROITS. En production, tout objet neuf reçoit par défaut tous les droits
-- pour anon et authenticated (pg_default_acl) : repris explicitement. Le
-- bureau LIT kiosks.kind (pour ignorer la ligne fixe) — jamais le sel ni
-- l'empreinte du jeton ; les colonnes neuves de kiosk_settings sont lues par
-- le bureau de l'entreprise seulement (policy existante kiosk_settings_admin_read,
-- inchangée) ; le salarié et anon ne lisent rien. Toutes les écritures passent
-- par la fonction kiosk (clé service), qui revérifie le rôle admin et
-- l'interrupteur kiosk_enabled.
--
-- AVANT CE FICHIER : l'application et la fonction kiosk marchent EXACTEMENT
-- comme aujourd'hui (colonnes absentes → ancien chemin ; le bureau ne voit pas
-- l'option). Rejouable : IF NOT EXISTS partout, contraintes posées une fois.
--
-- Testée sur un Postgres jetable : npm run test:qr-fixe-db
-- (supabase/tests/lot12_qr_fixe_position.mjs) — droits par défaut de
-- production, chargée deux fois, retour arrière puis rechargement.
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';

-- ── 1) Le type de borne : tablette (défaut) ou QR fixe ─────────────────────
ALTER TABLE public.kiosks
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'tablette';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kiosks_kind_check') THEN
    ALTER TABLE public.kiosks ADD CONSTRAINT kiosks_kind_check CHECK (kind IN ('tablette', 'fixe'));
  END IF;
END $$;

-- Au plus UN QR fixe actif par entreprise (régénérer = retirer puis créer).
CREATE UNIQUE INDEX IF NOT EXISTS kiosks_one_fixed_qr_idx
  ON public.kiosks (company_id) WHERE kind = 'fixe' AND revoked_at IS NULL;

COMMENT ON COLUMN public.kiosks.kind IS
  'Lot 12 : ''tablette'' (la borne qui affiche un QR changeant chaque minute) ou ''fixe'' (QR imprimé, position exigée au scan). Posé par la fonction kiosk seulement.';

-- ── 2) Point de référence et rayon du QR fixe ──────────────────────────────
ALTER TABLE public.kiosk_settings
  ADD COLUMN IF NOT EXISTS fixed_qr_latitude   numeric,
  ADD COLUMN IF NOT EXISTS fixed_qr_longitude  numeric,
  ADD COLUMN IF NOT EXISTS fixed_qr_accuracy_m integer,
  ADD COLUMN IF NOT EXISTS fixed_qr_point_at   timestamptz,
  ADD COLUMN IF NOT EXISTS fixed_qr_radius_m   integer NOT NULL DEFAULT 200;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kiosk_settings_fixed_qr_radius_check') THEN
    ALTER TABLE public.kiosk_settings ADD CONSTRAINT kiosk_settings_fixed_qr_radius_check
      CHECK (fixed_qr_radius_m BETWEEN 100 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kiosk_settings_fixed_qr_point_check') THEN
    ALTER TABLE public.kiosk_settings ADD CONSTRAINT kiosk_settings_fixed_qr_point_check
      CHECK ((fixed_qr_latitude IS NULL AND fixed_qr_longitude IS NULL)
             OR (fixed_qr_latitude IS NOT NULL AND fixed_qr_longitude IS NOT NULL AND fixed_qr_accuracy_m IS NOT NULL
                 AND fixed_qr_latitude BETWEEN -90 AND 90 AND fixed_qr_longitude BETWEEN -180 AND 180
                 AND fixed_qr_accuracy_m BETWEEN 0 AND 100));
  END IF;
END $$;

COMMENT ON COLUMN public.kiosk_settings.fixed_qr_latitude IS
  'Lot 12 : point de référence du QR fixe (position de l''ENTREPRISE, posée par le bureau à l''endroit du QR, précision ≤ 100 m). Aucune position de salarié n''est gardée nulle part.';
COMMENT ON COLUMN public.kiosk_settings.fixed_qr_radius_m IS
  'Lot 12 : rayon autour du point de référence (200 m par défaut, de 100 à 1 000 m). La fonction kiosk ajoute une marge liée à la précision annoncée (100 m au plus).';

-- ── 3) « Dans la zone : oui » sur le pointage, jamais de coordonnées ──────
ALTER TABLE public.kiosk_punches
  ADD COLUMN IF NOT EXISTS in_zone boolean;

COMMENT ON COLUMN public.kiosk_punches.in_zone IS
  'Lot 12 : TRUE = pointage fait avec le QR fixe, position vérifiée dans la zone au moment du scan. NULL = tablette (aucune position). Les coordonnées ne sont JAMAIS enregistrées.';

-- ── 4) QR refusés par adresse (plafond sur « ticket ») ─────────────────────
CREATE TABLE IF NOT EXISTS public.kiosk_ticket_failures (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiosk_ticket_failures_ip_idx ON public.kiosk_ticket_failures (ip, created_at DESC);
COMMENT ON TABLE public.kiosk_ticket_failures IS
  'Lot 12 : QR refusés (code faux, borne inconnue, jeton de QR fixe faux), par adresse. Au-delà de 30 en 10 minutes, la fonction kiosk répond « Trop d’essais ». Clé service seule.';

-- ── 5) Droits ──────────────────────────────────────────────────────────────
ALTER TABLE public.kiosk_ticket_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiosk_ticket_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.kiosk_ticket_failures TO service_role;
-- Aucune policy : seule la clé service (qui contourne RLS) lit et écrit.

-- Le bureau lit le type de ses bornes (policy existante kiosks_admin_read,
-- inchangée : son entreprise, admin seulement). Jamais le sel ni le jeton.
GRANT SELECT (kind) ON public.kiosks TO authenticated;
REVOKE SELECT (kind) ON public.kiosks FROM anon;
