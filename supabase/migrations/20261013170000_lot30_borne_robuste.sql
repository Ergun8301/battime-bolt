-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 30 (oct. 2026) — BORNE ROBUSTE : L'ÉTAT DE L'ÉCRAN DE LA TABLETTE
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin) : le bureau cesse de voir l'état
-- de l'écran (« l'écran peut s'éteindre », « hors ligne depuis »), la fonction
-- kiosk et la tablette continuent de marcher comme avant (colonnes absentes =
-- l'état envoyé est ignoré sans bruit). ⚠ Retirer les colonnes efface l'état
-- gardé de chaque tablette (il se reconstitue en 5 minutes après un nouveau
-- passage de la migration). Pour l'exécuter : copier les lignes ENTRE « DÉBUT »
-- et « FIN » en retirant au début de chaque ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- ALTER TABLE public.kiosks DROP CONSTRAINT IF EXISTS kiosks_client_state_forme;
-- ALTER TABLE public.kiosks DROP COLUMN IF EXISTS client_state, DROP COLUMN IF EXISTS client_state_at;
-- ── FIN DU RETOUR ARRIÈRE ──
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 8 × true :
-- SELECT
--   (SELECT data_type = 'jsonb' AND is_nullable = 'YES' AND column_default IS NULL FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosks' AND column_name = 'client_state') AS v1_etat_nullable,
--   (SELECT data_type = 'timestamp with time zone' AND is_nullable = 'YES' AND column_default IS NULL FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosks' AND column_name = 'client_state_at') AS v2_date_nullable,
--   (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.kiosks'::regclass AND conname = 'kiosks_client_state_forme' AND contype = 'c') = 1 AS v3_taille_bornee,
--   has_column_privilege('authenticated', 'public.kiosks', 'client_state', 'SELECT')
--   AND has_column_privilege('authenticated', 'public.kiosks', 'client_state_at', 'SELECT')
--   AND NOT has_column_privilege('anon', 'public.kiosks', 'client_state', 'SELECT')
--   AND NOT has_column_privilege('anon', 'public.kiosks', 'client_state_at', 'SELECT') AS v4_bureau_lit_anon_non,
--   NOT has_column_privilege('authenticated', 'public.kiosks', 'client_state', 'INSERT,UPDATE')
--   AND NOT has_column_privilege('authenticated', 'public.kiosks', 'client_state_at', 'INSERT,UPDATE')
--   AND NOT has_column_privilege('anon', 'public.kiosks', 'client_state', 'INSERT,UPDATE')
--   AND NOT has_column_privilege('anon', 'public.kiosks', 'client_state_at', 'INSERT,UPDATE') AS v5_ecriture_fonction_seule,
--   has_column_privilege('service_role', 'public.kiosks', 'client_state', 'SELECT,UPDATE')
--   AND has_column_privilege('service_role', 'public.kiosks', 'client_state_at', 'SELECT,UPDATE') AS v6_cle_service_ecrit,
--   (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kiosks'::regclass)
--   AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kiosks' AND policyname = 'kiosks_admin_read')
--   AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kiosks' AND cmd <> 'SELECT') AS v7_rls_lecture_seule,
--   NOT has_column_privilege('authenticated', 'public.kiosks', 'token_hash', 'SELECT')
--   AND NOT has_column_privilege('authenticated', 'public.kiosks', 'seed_salt', 'SELECT') AS v8_secrets_toujours_fermes;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261013170000', 'lot30_borne_robuste') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : la tablette de la borne se signale toutes les 5 minutes (action
-- `sync` de la fonction kiosk). Elle y joint maintenant un petit objet qui dit
-- si son écran peut s'éteindre (verrou d'écran tenu, refusé ou non pris en
-- charge), si la borne est ouverte depuis l'icône installée, en plein écran, en
-- ligne, et quelle version de l'appli elle fait tourner. La fenêtre « Borne » du
-- bureau le traduit en phrases (« réglez Verrouillage auto sur Jamais »,
-- « Tablette hors ligne depuis 14:32 »), seulement si l'état est récent.
--
-- CE QUE FAIT LE FICHIER (100 % ADDITIF, deux colonnes, rien d'autre) :
--   1) kiosks.client_state : l'objet, en jsonb, NULL tant que la tablette n'a rien
--      envoyé. Écrit UNIQUEMENT par la fonction kiosk (clé service), qui le valide
--      par liste blanche (cinq champs : wake, standalone, fullscreen, online,
--      version ; jamais de texte libre, de jeton ni de position). La taille est
--      bornée ici aussi : un objet, 256 octets au plus.
--   2) kiosks.client_state_at : l'heure (serveur) du dernier état reçu. Elle ne
--      bouge QUE quand la tablette elle-même envoie son état (jamais à la suite
--      d'un pointage), c'est ce qui permet de dire « hors ligne depuis … ».
--
-- DROITS. Aucune règle de ligne neuve : la lecture reste celle de la règle
-- existante `kiosks_admin_read` (l'administrateur de SON entreprise). Les droits
-- étant donnés colonne par colonne sur cette table (le sel et l'empreinte du
-- jeton restent fermés), les deux colonnes neuves sont ouvertes en LECTURE au
-- bureau (authenticated) et fermées à anon ; l'écriture n'est ouverte à
-- personne côté navigateur — seule la clé service (fonction kiosk) écrit.
--
-- AVANT CE FICHIER : la tablette, la fonction kiosk et le bureau marchent
-- EXACTEMENT comme aujourd'hui (la fonction tente l'écriture, la base répond
-- « colonne inconnue », la fonction l'ignore sans rien journaliser ; le bureau
-- relit les tablettes sans ces colonnes). Rejouable : IF NOT EXISTS partout,
-- contrainte posée une fois.
--
-- Testée sur un Postgres jetable : npm run test:borne-robuste-db
-- (supabase/tests/lot30_borne_robuste.mjs) — droits par défaut de production,
-- chargée deux fois, retour arrière puis rechargement.
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';

-- ── 1) Les deux colonnes (facultatives, sans valeur par défaut) ─────────────
ALTER TABLE public.kiosks
  ADD COLUMN IF NOT EXISTS client_state    jsonb,
  ADD COLUMN IF NOT EXISTS client_state_at timestamptz;

-- ── 2) Une forme et une taille bornées, quoi que la fonction écrive ─────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kiosks_client_state_forme') THEN
    ALTER TABLE public.kiosks ADD CONSTRAINT kiosks_client_state_forme
      CHECK (client_state IS NULL
             OR (jsonb_typeof(client_state) = 'object' AND octet_length(client_state::text) <= 256));
  END IF;
END $$;

COMMENT ON COLUMN public.kiosks.client_state IS
  'Lot 30 : état de l''écran de la tablette envoyé avec sync (wake held/denied/unsupported, standalone, fullscreen, online, version). Liste blanche validée par la fonction kiosk, 256 octets au plus, jamais de texte libre ni de secret. NULL = jamais reçu. Écrit par la fonction kiosk seulement.';
COMMENT ON COLUMN public.kiosks.client_state_at IS
  'Lot 30 : heure (serveur) du dernier état reçu de la tablette elle-même. Ne bouge jamais à la suite d''un pointage : sert à dire « hors ligne depuis … ».';

-- ── 3) Droits : le bureau lit (règle de ligne existante), la fonction écrit ──
-- Les colonnes sont ouvertes une à une (le sel et l'empreinte du jeton restent
-- fermés). Rien n'est ouvert à anon ; aucun droit d'écriture côté navigateur.
GRANT SELECT (client_state, client_state_at) ON public.kiosks TO authenticated;
REVOKE SELECT (client_state, client_state_at) ON public.kiosks FROM anon;
REVOKE INSERT (client_state, client_state_at), UPDATE (client_state, client_state_at)
  ON public.kiosks FROM anon, authenticated;
