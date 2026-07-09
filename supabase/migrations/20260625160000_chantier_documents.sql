-- 2026-06-25 — Module Documents (étape 2).
--
-- Photos + fichiers rattachés à un CHANTIER (worksite), avec un libellé saisi par
-- l'utilisateur. Déposés par la secrétaire (/admin) ET, plus tard, par le salarié
-- (/poseur). Consultables des deux côtés (périmètre entreprise).
--
-- Sécurité : tout est cloisonné par entreprise via get_my_company_id(). Bucket PRIVÉ
-- (on sert des URLs signées), écriture/lecture réservées aux membres de l'entreprise
-- dans le dossier {company_id}/…

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  worksite_id uuid NOT NULL REFERENCES public.worksites(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  label text,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_worksite_idx ON public.documents(worksite_id);
CREATE INDEX IF NOT EXISTS documents_company_idx ON public.documents(company_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS documents_delete ON public.documents;
CREATE POLICY documents_delete ON public.documents FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR uploaded_by = auth.uid()));

-- Bucket PRIVÉ (URLs signées). Lecture/écriture réservées au dossier de l'entreprise.
INSERT INTO storage.buckets (id, name, public)
VALUES ('chantier-docs', 'chantier-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chantier_docs_read" ON storage.objects;
CREATE POLICY "chantier_docs_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chantier-docs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

DROP POLICY IF EXISTS "chantier_docs_insert" ON storage.objects;
CREATE POLICY "chantier_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chantier-docs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

DROP POLICY IF EXISTS "chantier_docs_delete" ON storage.objects;
CREATE POLICY "chantier_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chantier-docs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
