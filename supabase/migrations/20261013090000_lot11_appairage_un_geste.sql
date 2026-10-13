-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 11 (oct. 2026) — APPAIRAGE DE LA TABLETTE EN UN SEUL GESTE
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin) : la tablette retombe toute
-- seule sur le code à 6 chiffres (la fonction kiosk répond « indisponible » dès
-- que les tables manquent, la borne se tait). Les tablettes déjà reliées ne sont
-- pas touchées. ⚠ Retirer les tables efface la trace des appairages par QR
-- (qui a confirmé, quand) : à ne faire que si on est sûr. Pour les retirer,
-- copier les lignes ENTRE « DÉBUT » et « FIN » en retirant « -- » et l'espace.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP TABLE IF EXISTS public.kiosk_pair_approvals;
-- DROP TABLE IF EXISTS public.kiosk_pair_throttle;
-- ── FIN DU RETOUR ARRIÈRE ──
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 10 × true :
-- SELECT
--   (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kiosk_pair_approvals'::regclass) AS v1_rls_confirmations,
--   (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kiosk_pair_throttle'::regclass) AS v2_rls_plafond,
--   NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('kiosk_pair_approvals', 'kiosk_pair_throttle')) AS v3_aucune_policy,
--   NOT has_table_privilege('anon', 'public.kiosk_pair_approvals', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
--   AND NOT has_table_privilege('authenticated', 'public.kiosk_pair_approvals', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
--   AND NOT has_table_privilege('anon', 'public.kiosk_pair_throttle', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
--   AND NOT has_table_privilege('authenticated', 'public.kiosk_pair_throttle', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
--   AND NOT has_any_column_privilege('anon', 'public.kiosk_pair_approvals', 'SELECT,INSERT,UPDATE,REFERENCES')
--   AND NOT has_any_column_privilege('authenticated', 'public.kiosk_pair_approvals', 'SELECT,INSERT,UPDATE,REFERENCES')
--   AND NOT has_any_column_privilege('anon', 'public.kiosk_pair_throttle', 'SELECT,INSERT,UPDATE,REFERENCES')
--   AND NOT has_any_column_privilege('authenticated', 'public.kiosk_pair_throttle', 'SELECT,INSERT,UPDATE,REFERENCES') AS v4_ni_anon_ni_compte,
--   has_table_privilege('service_role', 'public.kiosk_pair_approvals', 'SELECT')
--   AND has_table_privilege('service_role', 'public.kiosk_pair_approvals', 'INSERT')
--   AND has_table_privilege('service_role', 'public.kiosk_pair_approvals', 'UPDATE')
--   AND has_table_privilege('service_role', 'public.kiosk_pair_throttle', 'SELECT')
--   AND has_table_privilege('service_role', 'public.kiosk_pair_throttle', 'INSERT')
--   AND has_table_privilege('service_role', 'public.kiosk_pair_throttle', 'UPDATE') AS v5_cle_service_lit_et_ecrit,
--   NOT has_table_privilege('service_role', 'public.kiosk_pair_approvals', 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
--   AND NOT has_table_privilege('service_role', 'public.kiosk_pair_throttle', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v6_cle_service_sans_suppression,
--   (SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'kiosk_pair_approvals')
--     = 'approved_at,approved_by,cancelled_at,claimed_at,company_id,created_at,kiosk_id,rid_hash,secret_hash' AS v7_colonnes_confirmations,
--   (SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'kiosk_pair_throttle')
--     = 'bucket,hits,window_start' AS v8_colonnes_plafond,
--   (SELECT count(*) FROM pg_constraint WHERE contype = 'c'
--     AND conrelid IN ('public.kiosk_pair_approvals'::regclass, 'public.kiosk_pair_throttle'::regclass)
--     AND conname IN ('kiosk_pair_approvals_rid_hash_forme', 'kiosk_pair_approvals_secret_hash_forme',
--                     'kiosk_pair_approvals_etat', 'kiosk_pair_approvals_remise',
--                     'kiosk_pair_throttle_bucket_plage', 'kiosk_pair_throttle_hits_positif')) = 6 AS v9_controles,
--   (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'
--     AND indexname IN ('kiosk_pair_approvals_pkey', 'kiosk_pair_throttle_pkey', 'kiosk_pair_approvals_company_idx')) = 3
--   AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace
--                   AND (relname LIKE 'kiosk\_pair\_approvals%' OR relname LIKE 'kiosk\_pair\_throttle%')) AS v10_index_sans_sequence;
-- (v10 ne vise QUE les deux tables neuves : kiosk_pair_failures, du lot 1, a sa
--  propre séquence d'identifiant, qui est normale et ne doit pas être comptée.)
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261013090000', 'lot11_appairage_un_geste') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : la tablette affiche un QR, le patron le scanne et confirme (au lieu
-- de taper un code à 6 chiffres). La DEMANDE de la tablette n'est pas gardée : c'est un
-- identifiant signé par la fonction kiosk (10 minutes), rien n'est écrit tant
-- qu'un administrateur connecté n'a pas agi. Ce fichier ne garde donc que :
--   1) kiosk_pair_approvals : une ligne par demande CONFIRMÉE (ou refusée) par un
--      administrateur. Aucun secret en clair : l'empreinte SHA-256 de
--      l'identifiant de demande (clé), l'empreinte tronquée du secret d'appareil,
--      l'entreprise de l'administrateur, qui, quand. La ligne sert d'usage unique
--      (clé primaire + remise conditionnelle) et de trace. Le jeton de la tablette
--      n'y est JAMAIS : il est fabriqué (dérivé) à la remise.
--   2) kiosk_pair_throttle : plafond de débit du nouveau chemin, SANS adresse :
--      une ligne par « seau » d'une empreinte HMAC (adresse ou entreprise),
--      4 096 lignes au plus, réécrites toutes les 10 minutes. Deux espaces qui ne
--      se mélangent jamais : seaux 0 à 2047 = demandes anonymes des tablettes (par
--      adresse), seaux 2048 à 4095 = opérations du bureau (par entreprise). Sans
--      aucun lien avec kiosk_pair_failures (le compteur du code à 6 chiffres).
-- 100 % ADDITIF : rien d'existant n'est modifié. Aucune suppression, aucune clé
-- étrangère, aucune fonction. Tant que le fichier n'est pas appliqué, la fonction
-- kiosk répond « indisponible » et la borne garde son écran actuel.
-- CROISSANCE : kiosk_pair_throttle ≤ 4 096 lignes ; kiosk_pair_approvals = une ligne
-- par confirmation/refus d'un administrateur authentifié, plafonné à 20 opérations
-- par 10 minutes et par entreprise (au pire 2 880 lignes par jour et par
-- entreprise, ≈ 150 octets chacune). Aucune purge (aucune suppression permise).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kiosk_pair_approvals (
  rid_hash     text PRIMARY KEY,
  secret_hash  text NOT NULL,
  company_id   uuid NOT NULL,
  approved_by  uuid NOT NULL,
  approved_at  timestamptz,
  cancelled_at timestamptz,
  claimed_at   timestamptz,
  kiosk_id     uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiosk_pair_approvals_rid_hash_forme CHECK (rid_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT kiosk_pair_approvals_secret_hash_forme CHECK (secret_hash ~ '^[A-Za-z0-9_-]{22}$'),
  -- Une ligne est soit une confirmation, soit un refus, jamais les deux.
  CONSTRAINT kiosk_pair_approvals_etat CHECK ((approved_at IS NOT NULL) <> (cancelled_at IS NOT NULL)),
  -- Seule une confirmation peut être remise à la tablette.
  CONSTRAINT kiosk_pair_approvals_remise CHECK (claimed_at IS NULL OR approved_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS kiosk_pair_approvals_company_idx
  ON public.kiosk_pair_approvals (company_id, created_at DESC);
COMMENT ON TABLE public.kiosk_pair_approvals IS
  'Lot 11 : appairage de la tablette par QR. Une ligne par demande confirmée ou refusée par un administrateur. Empreintes seulement (aucun identifiant de demande, secret ni jeton en clair). Clé service seule, jamais de suppression.';

CREATE TABLE IF NOT EXISTS public.kiosk_pair_throttle (
  bucket       smallint PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits         integer NOT NULL DEFAULT 0,
  CONSTRAINT kiosk_pair_throttle_bucket_plage CHECK (bucket BETWEEN 0 AND 4095),
  CONSTRAINT kiosk_pair_throttle_hits_positif CHECK (hits >= 0)
);
COMMENT ON TABLE public.kiosk_pair_throttle IS
  'Lot 11 : plafond de débit de l''appairage par QR. Seaux 0 à 2047 : demandes anonymes des tablettes (30 par seau et par 10 minutes). Seaux 2048 à 4095 : opérations du bureau (20 par seau et par 10 minutes, seau d''entreprise). Seau = empreinte HMAC (adresse ou entreprise) : aucune adresse gardée, 4 096 lignes au plus, rien à purger. Sans lien avec kiosk_pair_failures. Clé service seule.';

-- ── Droits : fermé à tout le monde, la clé service lit et écrit (jamais de suppression) ──
ALTER TABLE public.kiosk_pair_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_pair_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiosk_pair_approvals FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.kiosk_pair_throttle FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.kiosk_pair_approvals TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.kiosk_pair_throttle TO service_role;
-- Aucune policy : seule la clé service (qui contourne RLS) lit et écrit.
