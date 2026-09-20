-- 2026-09-20 — Étape 12 bis : le nom d'une photo est attribué par la BASE, et
-- deux photos ne peuvent pas porter le même.
--
-- CE QUI N'ALLAIT PAS. Le nom automatique était « Photo N », N venant d'un
-- COMPTAGE des photos déjà présentes. Deux défauts, tous deux réels :
--
--   1. Après une suppression, le compteur recule. Supprimez « Photo 2 », gardez
--      « Photo 3 » : la suivante s'appelle encore « Photo 3 ». Deux pièces
--      portent le même nom, dans la liste ET dans l'e-mail au client.
--   2. Deux téléphones qui envoient en même temps lisent le même compte. Relire
--      le compte en base juste avant l'insertion ne fait que raccourcir la
--      fenêtre, elle ne la ferme pas.
--
-- (J'ai d'abord remplacé le numéro par l'heure d'ajout. Le test l'a démenti
-- tout de suite : trois photos d'une même réserve prises à la suite tombent
-- dans la même minute et reçoivent le même nom. Une granularité plus fine
-- n'aurait fait que déplacer le problème.)
--
-- CE QU'ON FAIT. Un numéro par chantier et par journée, rangé dans une colonne
-- `photo_no`, avec DEUX garanties qui se complètent :
--
--   - le numéro suivant est MAX + 1, jamais un comptage : une suppression ne
--     fait plus reculer la série ;
--   - un verrou consultatif le temps de la transaction sérialise l'attribution
--     pour un même chantier, et un index unique refuse physiquement un doublon.
--     Si le verrou venait à être contourné un jour, l'insertion échouerait
--     bruyamment au lieu de fabriquer deux « Photo 3 » en silence.
--
-- Le nom est posé dans `guard_document_write`, la fonction de garde déjà en
-- place, APRÈS la rectification de `work_date` : deux triggers séparés se
-- déclencheraient par ordre alphabétique, ce qui est une façon fragile de
-- décider qui parle en premier.
--
-- À exécuter AVANT de fusionner la PR.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS photo_no integer;

COMMENT ON COLUMN public.documents.photo_no IS
  'Numéro de la photo dans sa journée de chantier. Attribué par la base, jamais réutilisé après une suppression.';

-- L'invariant, tenu par la base et pas par la bonne volonté du code appelant.
-- `coalesce` : les pièces sans jour (fiche chantier) ont leur propre série.
CREATE UNIQUE INDEX IF NOT EXISTS documents_photo_no_unique
  ON public.documents (worksite_id, (COALESCE(work_date, DATE '0001-01-01')), photo_no)
  WHERE photo_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_document_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid;
  v_worksite uuid;
  v_date date;
  v_no int;
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

  -- Nom automatique d'une photo. Un fichier choisi par la personne garde le nom
  -- qu'elle lui a donné : le navigateur l'envoie, et on n'y touche pas.
  IF TG_OP = 'INSERT'
     AND nullif(btrim(coalesce(new.label, '')), '') IS NULL
     AND coalesce(new.mime_type, '') LIKE 'image/%' THEN

    -- Un seul attributeur à la fois pour ce chantier, le temps de la
    -- transaction. Sans ça, deux téléphones lisent le même MAX.
    PERFORM pg_advisory_xact_lock(hashtextextended(new.worksite_id::text, 0));

    SELECT COALESCE(max(d.photo_no), 0) + 1 INTO v_no
    FROM public.documents d
    WHERE d.worksite_id = new.worksite_id
      AND COALESCE(d.work_date, DATE '0001-01-01') = COALESCE(new.work_date, DATE '0001-01-01');

    new.photo_no := v_no;
    new.label := 'Photo ' || v_no
                 || CASE WHEN new.work_date IS NOT NULL
                         THEN ' — ' || to_char(new.work_date, 'DD/MM/YYYY')
                         ELSE '' END;
  END IF;

  RETURN new;
END;
$fn$;

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='documents' AND column_name='photo_no') AS colonne,
--   (SELECT count(*) FROM pg_indexes
--     WHERE schemaname='public' AND indexname='documents_photo_no_unique') AS index_unique;
