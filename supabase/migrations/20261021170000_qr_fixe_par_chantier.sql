-- ═════════════════════════════════════════════════════════════════════════════
-- KIOSQUE — QR FIXE ET PUCE NFC : UN RÉGLAGE PAR CHANTIER (oct. 2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI (demande d'Ergun) : les QR fixes déjà imprimés continuent de
-- marcher. Le bureau doit pouvoir, plus tard, les REFUSER sur un chantier
-- précis (sans couper le QR fixe de toute l'entreprise). La puce NFC contient
-- le même lien que le QR fixe : le réglage vaut pour les deux.
--
-- 100 % ADDITIF : une colonne neuve, vraie par défaut. Rien ne change tant que
-- le bureau ne décoche pas un chantier. Aucune policy, fonction ni donnée
-- existante n'est touchée. Écriture : la policy existante worksites_admin_write
-- (bureau seulement), inchangée.
--
-- AVANT CE FICHIER : la fonction kiosk et le bureau marchent comme avant
-- (colonne absente → QR fixe accepté partout ; la ligne du réglage ne
-- s'affiche pas dans la fiche client).
--
-- RETOUR ARRIÈRE :
--   ALTER TABLE public.worksites DROP COLUMN IF EXISTS fixed_qr_allowed;
--
-- VÉRIFICATION APRÈS APPLICATION (lecture seule, une ligne, true) :
--   SELECT is_nullable = 'NO' AND column_default = 'true'
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'worksites' AND column_name = 'fixed_qr_allowed';
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261021170000', 'qr_fixe_par_chantier') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.worksites
  ADD COLUMN IF NOT EXISTS fixed_qr_allowed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.worksites.fixed_qr_allowed IS
  'Faux = le QR fixe imprimé et la puce NFC sont refusés pour une arrivée ou un départ sur ce chantier (la tablette et la saisie à la main restent). Posé par le bureau.';
