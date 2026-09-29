-- ════════════════════════════════════════════════════════════════════════════
-- LOT 1 — BORNE DE POINTAGE QR
--
-- Ce que ça fait
-- ──────────────
-- Une tablette posée à l'entrée affiche un QR qui change chaque minute. Le
-- salarié le scanne avec son téléphone : arrivée ou départ, sans rien choisir.
--
-- 100 % ADDITIF — à relire avant d'appliquer
-- ──────────────────────────────────────────
--   · une colonne `companies.kiosk_enabled`, FALSE par défaut : tant qu'elle
--     n'est pas passée à TRUE pour une entreprise (à la main, en SQL), aucun
--     écran ni menu nouveau n'apparaît chez elle ;
--   · cinq tables neuves, préfixées `kiosk_` ;
--   · AUCUN DROP, AUCUN RENAME, aucune policy ni fonction existante modifiée.
--
-- Qui écrit
-- ─────────
-- PERSONNE côté navigateur. Aucune de ces tables n'a de policy d'écriture :
-- toutes les écritures passent par la fonction Edge `kiosk` (clé service),
-- qui vérifie elle-même le rôle admin, l'interrupteur de l'entreprise et la
-- validité de la borne. Le bureau (admin) a seulement le droit de LIRE ses
-- bornes et ses réglages ; un salarié ne lit rien.
--
-- Le pointage lui-même ne passe PAS par ces tables : la fonction `kiosk` écrit
-- dans `active_sessions` puis appelle `stop_active_session`, AU NOM DU SALARIÉ
-- (avec son jeton, donc ses policies) — exactement comme l'application. Les
-- règles d'aujourd'hui (quart d'heure, mois clôturé, chantier de l'entreprise)
-- s'appliquent donc à l'identique.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) L'interrupteur, éteint pour tout le monde ────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS kiosk_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.kiosk_enabled IS
  'Borne de pointage QR (lot 1). FALSE par défaut : aucun écran ni menu tant que ce n''est pas activé.';

-- ── 2) Les réglages de la borne, par entreprise ─────────────────────────────
-- Une ligne n'existe qu'une fois l'admin passé par l'écran : son absence vaut
-- « tout désactivé ».
CREATE TABLE IF NOT EXISTS public.kiosk_settings (
  company_id    uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Afficher sur la tablette le planning du jour (prénom + horaire, rien d'autre).
  show_planning boolean NOT NULL DEFAULT false,
  -- Refuser un scan fait à plus de 200 m de la borne.
  require_gps   boolean NOT NULL DEFAULT false,
  -- Horaires d'ouverture de la borne (heure de Paris) : écran noir en dehors,
  -- un toucher le rallume. NULL = toujours allumée.
  active_from   time,
  active_until  time,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 3) Les bornes ───────────────────────────────────────────────────────────
-- AUCUN SECRET EN CLAIR ICI.
--   · `token_hash` : empreinte SHA-256 du jeton de la tablette (celui qui lui
--     sert à se présenter). Le jeton lui-même n'existe que sur la tablette.
--   · la graine du QR n'est PAS stockée : elle est recalculée à la demande par
--     la fonction `kiosk` à partir d'une clé serveur et de `seed_salt`. Voler
--     cette table ne permet donc pas de fabriquer un QR valide.
-- Retirer une borne = poser `revoked_at` : ses QR et son jeton cessent de
-- fonctionner immédiatement.
CREATE TABLE IF NOT EXISTS public.kiosks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  -- Le lieu où l'arrivée est enregistrée (un chantier de l'entreprise).
  worksite_id   uuid REFERENCES public.worksites(id) ON DELETE SET NULL,
  token_hash    text NOT NULL,
  seed_salt     text NOT NULL,
  -- Position de la tablette relevée à l'appairage (facultative) : sert au
  -- contrôle « le salarié est sur place » quand l'option est activée.
  latitude      numeric,
  longitude     numeric,
  accuracy_m    integer,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS kiosks_company_idx ON public.kiosks (company_id);

-- ── 4) Les codes d'appairage (6 chiffres, 10 minutes) ───────────────────────
-- Seule l'empreinte du code est gardée. Un code sert une fois.
CREATE TABLE IF NOT EXISTS public.kiosk_pairings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code_hash     text NOT NULL,
  name          text NOT NULL,
  worksite_id   uuid REFERENCES public.worksites(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  kiosk_id      uuid REFERENCES public.kiosks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS kiosk_pairings_code_idx ON public.kiosk_pairings (code_hash);

-- ── 5) Les scans acceptés ───────────────────────────────────────────────────
-- Sert à refuser un double scan dans la même minute, et à dater la dernière
-- activité d'une borne. Ni heure travaillée, ni paie : les heures restent dans
-- `time_entries`, écrites par `stop_active_session` comme d'habitude.
CREATE TABLE IF NOT EXISTS public.kiosk_punches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kiosk_id      uuid NOT NULL REFERENCES public.kiosks(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('arrival', 'departure')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiosk_punches_user_idx ON public.kiosk_punches (user_id, created_at DESC);

-- ── 6) Les essais de code d'appairage ratés ─────────────────────────────────
-- Un code à 6 chiffres se devine si on essaie assez vite : au-delà de
-- 10 échecs en 10 minutes depuis la même adresse, la fonction refuse.
CREATE TABLE IF NOT EXISTS public.kiosk_pair_failures (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip            text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiosk_pair_failures_ip_idx ON public.kiosk_pair_failures (ip, created_at DESC);

-- ── 7) Droits ───────────────────────────────────────────────────────────────
ALTER TABLE public.kiosk_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_pairings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_punches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_pair_failures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kiosk_settings, public.kiosks, public.kiosk_pairings,
              public.kiosk_punches, public.kiosk_pair_failures
  FROM anon, authenticated;

-- Le bureau LIT ses bornes et ses réglages (colonnes sans secret seulement).
GRANT SELECT ON public.kiosk_settings TO authenticated;
GRANT SELECT (id, company_id, name, worksite_id, latitude, longitude, accuracy_m,
              created_at, last_seen_at, revoked_at)
  ON public.kiosks TO authenticated;

CREATE POLICY kiosk_settings_admin_read ON public.kiosk_settings
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

CREATE POLICY kiosks_admin_read ON public.kiosks
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- `kiosk_pairings`, `kiosk_punches`, `kiosk_pair_failures` : aucune policy,
-- aucun droit client. Clé service uniquement.

-- ════════════════════════════════════════════════════════════════════════════
-- Contrôle après application (lecture seule) :
--
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='companies' AND column_name='kiosk_enabled') AS colonne_1,
--   (SELECT count(*) FROM public.companies WHERE kiosk_enabled)                                AS actives_0,
--   (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'kiosk%')     AS tables_5,
--   (SELECT bool_and(rowsecurity) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'kiosk%') AS rls_true,
--   (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'kiosk%')   AS policies_2;
--
-- Activer la borne pour UNE entreprise (après validation) :
--   UPDATE public.companies SET kiosk_enabled = true WHERE id = '<company_id>';
-- ════════════════════════════════════════════════════════════════════════════
