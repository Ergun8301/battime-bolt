-- ════════════════════════════════════════════════════════════════════════════
-- BORNE DE POINTAGE QR (lot 1)
--
-- Une tablette à l'entrée affiche un QR qui change chaque minute. Le salarié le
-- scanne avec son téléphone : arrivée ou départ, sur SON compte.
--
-- 100 % ADDITIF. Une colonne neuve avec valeur par défaut, cinq tables neuves.
-- Aucune table, policy ou fonction existante n'est modifiée. Le pointage passe
-- toujours par `active_sessions` (arrivée) et `stop_active_session()` (départ),
-- appelés AVEC LE JETON DU SALARIÉ : la RLS et les gardes existantes
-- s'appliquent exactement comme depuis son téléphone.
--
-- INTERRUPTEUR : `companies.kiosk_enabled`, faux par défaut. Tant qu'il est
-- faux, aucun écran ni menu n'apparaît et la fonction `kiosk` refuse tout.
-- Activation, pour l'instant, à la main :
--   UPDATE public.companies SET kiosk_enabled = true WHERE id = '…';
--
-- ACCÈS : uniquement par l'Edge Function `kiosk` (clé service). RLS active,
-- AUCUNE policy : ni l'application ni un visiteur ne lisent ces tables en
-- direct — en particulier jamais la clé des QR.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS kiosk_enabled boolean NOT NULL DEFAULT false;

-- ── Réglages de la borne, un par entreprise ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kiosk_settings (
  company_id    uuid        PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  show_planning boolean     NOT NULL DEFAULT false,
  require_gps   boolean     NOT NULL DEFAULT false,
  -- Écran allumé entre ces deux heures (heure de la tablette). NULL = toujours.
  awake_from    time,
  awake_until   time,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Codes d'appairage : 6 chiffres, 10 minutes, un seul usage ──────────────
CREATE TABLE IF NOT EXISTS public.kiosk_pairings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Jamais le code en clair : son empreinte SHA-256.
  code_hash   text        NOT NULL,
  name        text        NOT NULL,
  worksite_id uuid        NOT NULL REFERENCES public.worksites(id) ON DELETE CASCADE,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiosk_pairings_code_idx ON public.kiosk_pairings (code_hash) WHERE used_at IS NULL;

-- ── Les bornes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kiosk_devices (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  -- Le chantier / l'établissement sur lequel les arrivées sont ouvertes.
  worksite_id  uuid        NOT NULL REFERENCES public.worksites(id) ON DELETE CASCADE,
  -- sha256(secret) : reconnaît la tablette. Le secret lui-même n'est jamais stocké.
  token_hash   text        NOT NULL UNIQUE,
  -- Clé des QR, DÉRIVÉE du secret (HMAC) : vérifie les codes, ne redonne pas le secret.
  totp_key     text        NOT NULL,
  -- Position relevée à l'appairage (option GPS). NULL si refusée.
  latitude     numeric,
  longitude    numeric,
  accuracy_m   integer,
  created_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  paired_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  -- Révocation immédiate : la borne ne peut plus rien valider.
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS kiosk_devices_company_idx ON public.kiosk_devices (company_id);

-- ── Journal des scans (anti-doublon + traçabilité) ─────────────────────────
-- Aucune position du salarié n'y est conservée : l'option GPS compare, elle
-- n'enregistre pas.
CREATE TABLE IF NOT EXISTS public.kiosk_scans (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  device_id  uuid        NOT NULL REFERENCES public.kiosk_devices(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- 'pending' le temps de l'écriture du pointage, puis 'in' ou 'out'.
  direction  text        NOT NULL DEFAULT 'pending' CHECK (direction IN ('pending', 'in', 'out')),
  -- Minute du serveur : deux scans simultanés du même salarié se heurtent ici.
  minute     bigint      NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, minute)
);
CREATE INDEX IF NOT EXISTS kiosk_scans_user_idx ON public.kiosk_scans (user_id, created_at DESC);

-- ── Frein à la devinette des codes d'appairage ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.kiosk_pair_attempts (
  ip_hash    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiosk_pair_attempts_idx ON public.kiosk_pair_attempts (ip_hash, created_at);

-- ── Verrouillage : clé service uniquement ──────────────────────────────────
ALTER TABLE public.kiosk_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_pairings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_devices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_scans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_pair_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kiosk_settings, public.kiosk_pairings, public.kiosk_devices,
              public.kiosk_scans, public.kiosk_pair_attempts FROM anon, authenticated;
GRANT ALL ON public.kiosk_settings, public.kiosk_pairings, public.kiosk_devices,
             public.kiosk_scans, public.kiosk_pair_attempts TO service_role;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_name = 'companies' AND column_name = 'kiosk_enabled') AS interrupteur,
--   (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'kiosk_%') AS tables_5,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'kiosk_%') AS policies_0,
--   (SELECT count(*) FROM public.companies WHERE kiosk_enabled) AS entreprises_actives_0;
