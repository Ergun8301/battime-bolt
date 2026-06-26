-- 2026-06-25 — Photo de profil salarié.
--
-- Le salarié téléverse SA propre photo depuis /poseur ; elle s'affiche à la place
-- des initiales (planning admin + en-tête poseur). Tout est facultatif.
--
-- Sécurité :
--   - écriture Storage réservée au salarié dans SON dossier {user_id}/… ;
--   - lecture publique (pour afficher la photo, comme le logo entreprise) ;
--   - users.photo_url mis à jour UNIQUEMENT pour soi via update_my_photo()
--     (SECURITY DEFINER, dérive l'utilisateur de auth.uid()).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_url text;

-- Bucket public en lecture (affichage), écriture réservée au salarié dans son dossier.
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-photos', 'worker-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "worker_photos_read" ON storage.objects;
CREATE POLICY "worker_photos_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'worker-photos');

DROP POLICY IF EXISTS "worker_photos_insert" ON storage.objects;
CREATE POLICY "worker_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worker-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "worker_photos_update" ON storage.objects;
CREATE POLICY "worker_photos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'worker-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'worker-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "worker_photos_delete" ON storage.objects;
CREATE POLICY "worker_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'worker-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Mise à jour de SA propre photo uniquement (dérive l'utilisateur de auth.uid()).
CREATE OR REPLACE FUNCTION public.update_my_photo(p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.users SET photo_url = nullif(p_url, '') WHERE id = auth.uid();
END;
$function$;
REVOKE ALL ON FUNCTION public.update_my_photo(text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_my_photo(text) TO authenticated;
