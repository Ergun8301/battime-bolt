-- 2026-09-20 — Étape 12 : une pièce appartient à un JOUR et à une INTERVENTION.
--
-- AVANT : un document n'était rattaché qu'au chantier. Sur un chantier de six
-- mois, toutes les photos tombaient dans le même tas, dans l'ordre d'envoi.
-- Impossible de dire « montre-moi les photos du jour où le client a émis la
-- réserve » : il fallait lire les dates une par une et deviner.
--
-- MAINTENANT : la pièce porte le jour, et l'intervention quand elle a été prise
-- depuis une intervention ouverte. Le tas devient un classeur.
--
-- `work_date` reste NULLABLE : un devis déposé depuis la fiche chantier
-- n'appartient à aucune journée de travail, et lui coller la date du jour
-- serait une information inventée.
--
-- `ON DELETE SET NULL` sur l'intervention, PAS `CASCADE` : si une intervention
-- est retirée, la photo doit survivre. Une photo de réserve est une preuve ;
-- elle reste rattachée au chantier et au jour.
--
-- À exécuter AVANT de fusionner la PR.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS work_date date,
  ADD COLUMN IF NOT EXISTS time_entry_id uuid REFERENCES public.time_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.documents.work_date IS
  'Journée de chantier à laquelle la pièce se rapporte. NULL = pièce du chantier, pas d''un jour précis (devis, plan).';
COMMENT ON COLUMN public.documents.time_entry_id IS
  'Intervention depuis laquelle la pièce a été ajoutée. Survit à sa suppression (SET NULL) : une photo de réserve est une preuve.';

-- Le panneau lit par chantier et affiche par jour décroissant.
CREATE INDEX IF NOT EXISTS documents_worksite_day_idx
  ON public.documents (company_id, worksite_id, work_date DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_time_entry_idx
  ON public.documents (time_entry_id) WHERE time_entry_id IS NOT NULL;

-- ── Cohérence de la pièce ─────────────────────────────────────────────────
-- Sans ce garde, rien n'empêche d'attacher une photo à l'intervention d'un
-- autre chantier, d'un autre jour, ou d'une autre entreprise : le classeur
-- rangerait les preuves dans le mauvais dossier, ce qui est pire que pas de
-- classement du tout.
CREATE OR REPLACE FUNCTION public.guard_document_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_worksite uuid;
  v_date date;
BEGIN
  -- Le chantier appartient bien à l'entreprise de la pièce.
  IF NOT EXISTS (SELECT 1 FROM public.worksites w
                 WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'documents: chantier hors de votre entreprise';
  END IF;

  IF new.time_entry_id IS NOT NULL THEN
    SELECT t.company_id, t.worksite_id, t.work_date
      INTO v_company, v_worksite, v_date
      FROM public.time_entries t WHERE t.id = new.time_entry_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'documents: intervention introuvable';
    END IF;
    IF v_company <> new.company_id OR v_worksite IS DISTINCT FROM new.worksite_id THEN
      RAISE EXCEPTION 'documents: cette intervention n''est pas celle de ce chantier';
    END IF;
    -- Le jour est celui de l'intervention, point. On le rectifie au lieu de
    -- refuser : le navigateur n'a pas à être la source de cette date.
    new.work_date := v_date;
  END IF;
  RETURN new;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.guard_document_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS documents_guard_write ON public.documents;
CREATE TRIGGER documents_guard_write
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_write();

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='documents'
--       AND column_name IN ('work_date','time_entry_id')) AS colonnes,
--   (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
--     AND indexname IN ('documents_worksite_day_idx','documents_time_entry_idx')) AS index_docs,
--   (SELECT count(*) FROM pg_trigger WHERE tgname='documents_guard_write') AS garde;
