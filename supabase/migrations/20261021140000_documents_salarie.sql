-- Documents d'un salarié : bulletins de paie, contrat, arrêt maladie, justificatifs… (fiche salarié › « Documents », appli salarié › « Mes documents »).
--
-- Qui voit quoi :
--   · le bureau (administrateur actif de l'entreprise) voit, dépose et retire les documents de TOUS les salariés de son entreprise ;
--   · le salarié voit SES documents, en dépose (photo d'un arrêt, justificatif…) et ne retire que ceux qu'il a déposés lui-même ;
--   · personne d'une autre entreprise ne voit rien (dossier `<entreprise>/<salarié>/` dans un bucket PRIVÉ, URLs signées).
--
-- `category` : simple rangement choisi au dépôt (n'importe quel fichier est accepté). `ai_summary` / `ai_read_at` : réservés à la lecture par l'assistant
-- (étape suivante), écrits côté serveur ; personne ne les modifie depuis l'application (aucune règle UPDATE).
--
-- AJOUT PUR : une table, un bucket, leurs règles. Aucune table existante touchée.
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.users(id),
  category    text NOT NULL DEFAULT 'autre' CHECK (category IN ('bulletin', 'contrat', 'autre')),
  label       text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  path        text NOT NULL UNIQUE,
  mime        text,
  size_bytes  bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  ai_summary  text,
  ai_read_at  timestamptz
);
CREATE INDEX IF NOT EXISTS worker_documents_user_idx ON public.worker_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS worker_documents_company_idx ON public.worker_documents (company_id);

ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worker_documents FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.worker_documents TO authenticated;
GRANT ALL ON public.worker_documents TO service_role;

DROP POLICY IF EXISTS worker_documents_select ON public.worker_documents;
CREATE POLICY worker_documents_select ON public.worker_documents FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS worker_documents_insert ON public.worker_documents;
CREATE POLICY worker_documents_insert ON public.worker_documents FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND uploaded_by = (SELECT auth.uid())
    AND (public.is_admin() OR user_id = (SELECT auth.uid()))
    AND path LIKE company_id::text || '/' || user_id::text || '/%'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = worker_documents.user_id AND u.company_id = worker_documents.company_id));

DROP POLICY IF EXISTS worker_documents_delete ON public.worker_documents;
CREATE POLICY worker_documents_delete ON public.worker_documents FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND (public.is_admin() OR (user_id = (SELECT auth.uid()) AND uploaded_by = (SELECT auth.uid()))));

-- Bucket PRIVÉ, 15 Mo par fichier. Chemin : <entreprise>/<salarié>/<uuid>.<ext>.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('worker-docs', 'worker-docs', false, 15728640)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "worker_docs_read" ON storage.objects;
CREATE POLICY "worker_docs_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'worker-docs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND (public.is_admin() OR (storage.foldername(name))[2] = (SELECT auth.uid())::text));

DROP POLICY IF EXISTS "worker_docs_insert" ON storage.objects;
CREATE POLICY "worker_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worker-docs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND (public.is_admin() OR (storage.foldername(name))[2] = (SELECT auth.uid())::text));

DROP POLICY IF EXISTS "worker_docs_delete" ON storage.objects;
-- Le salarié ne retire que les fichiers qu'il a lui-même déposés (`owner`), jamais un bulletin déposé par le bureau.
CREATE POLICY "worker_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'worker-docs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND (public.is_admin() OR ((storage.foldername(name))[2] = (SELECT auth.uid())::text AND owner = (SELECT auth.uid()))));
