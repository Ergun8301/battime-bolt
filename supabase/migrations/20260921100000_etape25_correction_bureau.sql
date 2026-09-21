-- APPLIQUÉE EN PRODUCTION LE 21/09/2026, et vérifiée objet par objet : table +
-- RLS active + 3 policies, trigger d'immuabilité, `correct_time_entry` présente
-- et SECURITY INVOKER, admin désormais horodaté, garde « mois clôturé » du
-- salarié intacte, 46 pointages et 0 correction au moment de la bascule.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 25 — Le bureau corrige les heures, et le salarié le sait
-- ═════════════════════════════════════════════════════════════════════════════
--
-- CE QUI EXISTE AUJOURD'HUI, VÉRIFIÉ EN BASE ET PAS SUPPOSÉ :
--
--   ADMIN corrige une ligne envoyée   modified_at = NULL — AUCUNE TRACE
--   SALARIÉ corrige la sienne         modified_at + modified_by posés
--   CHEF D'ÉQUIPE corrige son équipier  accepté, et tracé correctement
--
-- Le bureau est donc le SEUL à pouvoir changer des heures sans laisser de
-- trace. Ce n'est pas un oubli de colonne : `guard_time_entry_write()` sort à
-- sa toute première ligne quand l'auteur est admin, et saute donc l'horodatage
-- en même temps que les gardes métier.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · L'HISTORIQUE DES CORRECTIONS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI UNE TABLE ET PAS DES COLONNES SUR `time_entries`. Trois raisons, la
-- troisième étant celle qui tranche :
--
--   · CORRECTIONS SUCCESSIVES. Des colonnes « valeur d'origine » n'en gardent
--     qu'une. À la deuxième correction il faut choisir entre écraser la vraie
--     origine et figer la première — dans les deux cas on ment sur la suite
--     9h → 7h → 8h. Une table garde la chaîne.
--
--   · `time_entries` EST LA TABLE CHAUDE. Planning, exports, coût chantier,
--     récapitulatifs de paie la lisent en permanence. Quatre colonnes de plus
--     la chargent pour toujours, au bénéfice d'un événement rare.
--
--   · IL FAUT UN ENDROIT OÙ ÉCRIRE SI LE SALARIÉ A ÉTÉ PRÉVENU. C'est
--     l'exigence qui décide : la correction doit être notifiée, et l'échec
--     d'envoi ne doit jamais passer inaperçu. Des colonnes sur `time_entries`
--     n'auraient eu nulle part où mettre ça. Une ligne d'historique porte
--     naturellement qui a corrigé, quoi, quand, ET ce qu'est devenue la
--     notification.
--
-- LA TABLE EST UN JOURNAL : on y ajoute, on n'y réécrit pas — à une exception
-- près, l'issue de la notification, que seul l'auteur de la correction peut
-- renseigner, et une seule fois (voir la policy UPDATE plus bas).

CREATE TABLE IF NOT EXISTS public.time_entry_corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- La ligne corrigée. ON DELETE CASCADE : si la ligne d'heures disparaît, son
  -- historique n'a plus d'objet.
  entry_id      uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  -- À QUI appartiennent ces heures. Dupliqué depuis time_entries à dessein :
  -- c'est la clé de lecture du salarié, et elle doit survivre à une réécriture
  -- de la ligne.
  worker_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  work_date     date NOT NULL,

  -- QUI a corrigé. Pas de ON DELETE CASCADE : un compte supprimé ne doit pas
  -- effacer la preuve de ce qu'il a fait.
  corrected_by  uuid NOT NULL REFERENCES public.users(id),
  -- LE RÔLE AU MOMENT DES FAITS, figé. Un chef d'équipe redevenu simple
  -- salarié ne doit pas transformer rétroactivement « ton chef a corrigé » en
  -- autre chose : un journal raconte ce qui s'est passé, pas ce qui est vrai
  -- aujourd'hui. C'est aussi ce qui permet à l'écran du salarié de dire la même
  -- chose que la notification qu'il a reçue.
  corrected_by_role text NOT NULL CHECK (corrected_by_role IN ('admin','lead')),
  corrected_at  timestamptz NOT NULL DEFAULT now(),

  -- AVANT et APRÈS. C'est ce qui permet d'écrire « 9h00 → 7h00 » au salarié.
  old_start     time NOT NULL,
  old_end       time NOT NULL,
  new_start     time NOT NULL,
  new_end       time NOT NULL,

  -- La paie était-elle déjà partie chez le comptable au moment de la
  -- correction ? On le fige ici : `exported_at` peut changer ensuite, la
  -- question « est-ce que ça corrigeait un export déjà envoyé » ne le peut pas.
  was_exported  boolean NOT NULL DEFAULT false,

  -- L'ISSUE DE LA NOTIFICATION. `notified_at` NULL = le salarié n'a pas été
  -- prévenu. C'est un état VISIBLE et honnête : mieux vaut savoir qu'on ne
  -- sait pas. `notify_error` dit pourquoi quand on le sait.
  notified_at   timestamptz,
  notify_error  text,

  -- Une correction qui ne change rien n'est pas une correction.
  CONSTRAINT time_entry_corrections_change_reelle
    CHECK ((old_start, old_end) IS DISTINCT FROM (new_start, new_end))
);

-- Lecture du salarié : « mes corrections, les plus récentes d'abord ».
CREATE INDEX IF NOT EXISTS time_entry_corrections_worker_idx
  ON public.time_entry_corrections (worker_id, work_date DESC);
-- Lecture de l'écran : « l'historique de CETTE ligne », dans l'ordre.
CREATE INDEX IF NOT EXISTS time_entry_corrections_entry_idx
  ON public.time_entry_corrections (entry_id, corrected_at);

ALTER TABLE public.time_entry_corrections ENABLE ROW LEVEL SECURITY;

-- ── LECTURE ────────────────────────────────────────────────────────────────
-- Le salarié voit ce qui a été fait à SES heures — c'est le but même de
-- l'étape. Le bureau voit celles de sa société. Le chef d'équipe voit celles
-- qu'il a faites lui-même, et rien de plus : il n'a pas à consulter les
-- corrections du bureau sur ses équipiers.
CREATE POLICY time_entry_corrections_select ON public.time_entry_corrections
  FOR SELECT USING (
    company_id = public.get_my_company_id()
    AND (
      public.is_admin()
      OR worker_id = auth.uid()
      OR corrected_by = auth.uid()
    )
  );

-- ── ÉCRITURE ───────────────────────────────────────────────────────────────
-- On n'inscrit une correction QU'À SON PROPRE NOM. Sans `corrected_by =
-- auth.uid()`, n'importe qui pourrait fabriquer un historique attribué à un
-- autre — un journal falsifiable ne vaut rien.
--
-- Qui a le droit d'inscrire : celui qui a le droit de corriger. L'admin sur sa
-- société ; le chef d'équipe uniquement sur un équipier dont il peut réellement
-- modifier les heures ce jour-là. On réutilise `is_my_team_member`, LE MÊME
-- prédicat que la policy `time_entries_lead_update` : la trace ne peut donc pas
-- couvrir plus large que l'écriture qu'elle trace.
CREATE POLICY time_entry_corrections_insert ON public.time_entry_corrections
  FOR INSERT WITH CHECK (
    company_id = public.get_my_company_id()
    AND corrected_by = auth.uid()
    AND (
      public.is_admin()
      OR public.is_my_team_member(worker_id, work_date)
    )
  );

-- ── L'ISSUE DE LA NOTIFICATION, ET RIEN D'AUTRE ────────────────────────────
-- L'auteur de la correction revient renseigner `notified_at` / `notify_error`
-- une fois l'envoi tenté. `USING notified_at IS NULL` rend l'opération
-- non rejouable : une fois l'issue inscrite, elle ne se réécrit plus.
--
-- Le garde `guard_correction_immutable()` plus bas empêche de profiter de cette
-- porte pour retoucher les heures d'origine.
CREATE POLICY time_entry_corrections_update_notify ON public.time_entry_corrections
  FOR UPDATE
  USING (company_id = public.get_my_company_id()
         AND corrected_by = auth.uid()
         AND notified_at IS NULL)
  WITH CHECK (company_id = public.get_my_company_id()
              AND corrected_by = auth.uid());

-- Aucune policy DELETE : un journal ne s'efface pas. Seul `service_role` peut
-- passer outre, et c'est le comportement voulu.

-- ── LE JOURNAL EST IMMUABLE, SAUF L'ISSUE D'ENVOI ──────────────────────────
-- La policy UPDATE ci-dessus ouvre la ligne ; ce garde décide de ce qu'on a le
-- droit d'y changer. Sans lui, l'auteur d'une correction pourrait réécrire
-- « 9h00 → 7h00 » en « 9h00 → 8h45 » après coup, et le journal mentirait.
CREATE OR REPLACE FUNCTION public.guard_correction_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN new;  -- service_role : inchangé
  END IF;
  new.id           := old.id;
  new.company_id   := old.company_id;
  new.entry_id     := old.entry_id;
  new.worker_id    := old.worker_id;
  new.work_date    := old.work_date;
  new.corrected_by := old.corrected_by;
  new.corrected_by_role := old.corrected_by_role;
  new.corrected_at := old.corrected_at;
  new.old_start    := old.old_start;
  new.old_end      := old.old_end;
  new.new_start    := old.new_start;
  new.new_end      := old.new_end;
  new.was_exported := old.was_exported;
  RETURN new;
END;
$fn$;

DROP TRIGGER IF EXISTS time_entry_corrections_guard ON public.time_entry_corrections;
CREATE TRIGGER time_entry_corrections_guard
  BEFORE UPDATE ON public.time_entry_corrections
  FOR EACH ROW EXECUTE FUNCTION public.guard_correction_immutable();

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · L'ADMIN PASSE DÉSORMAIS PAR L'HORODATAGE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ADDITIF, JAMAIS SOUSTRACTIF. Aucun garde-fou existant ne disparaît :
--
--   · `auth.uid() IS NULL` reste la PREMIÈRE branche, strictement inchangée —
--     le cron et `service_role` ne doivent rien voir de cette migration.
--   · L'admin garde TOUS ses droits élargis : mois clôturé, changement de
--     statut, colonnes figées. Il ne saute plus qu'une chose de moins.
--   · Le chemin des non-admins est recopié mot pour mot.
--
-- ET SEULEMENT SUR `UPDATE`. Un ajout n'est pas une correction : horodater une
-- insertion ferait passer une ligne créée par le bureau pour une ligne
-- retouchée, et brouillerait précisément la lecture qu'on cherche à donner.
--
-- Le tuple de champs surveillé est le MÊME que pour un salarié. Deux listes
-- différentes finiraient par diverger, et l'une des deux mentirait.

CREATE OR REPLACE FUNCTION public.guard_time_entry_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;

  IF public.is_admin() THEN
    -- Le bureau conserve ses droits élargis. On lui ajoute la trace, sans rien
    -- lui retirer : il peut toujours corriger un mois clôturé, c'est lui
    -- l'autorité. Mais on saura qu'il l'a fait, et quand.
    IF TG_OP = 'UPDATE' AND (
         (new.start_time, new.end_time, new.break_minutes, new.meal_allowance,
          new.observation, new.reception, new.worksite_id, new.photos, new.gap_before)
         IS DISTINCT FROM
         (old.start_time, old.end_time, old.break_minutes, old.meal_allowance,
          old.observation, old.reception, old.worksite_id, old.photos, old.gap_before)
       ) THEN
      new.modified_at := now();
      new.modified_by := auth.uid();
    END IF;
    RETURN new;
  END IF;

  -- ── À partir d'ici, RIEN N'A CHANGÉ. Chemin des non-admins, à l'identique. ──

  IF public.is_month_closed(new.company_id, new.work_date)
     AND current_setting('bemexo.allow_reserve_fix', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'time_entries: le mois est clôturé par le bureau';
  END IF;

  IF TG_OP = 'INSERT' THEN
    new.locked       := false;
    new.exported_at  := NULL;
    new.validated_at := NULL;
    new.validated_by := NULL;
    new.modified_at  := NULL;
    new.modified_by  := NULL;
    new.submitted_at := NULL;
    new.reserve_resolved_at := NULL;
    new.reserve_resolved_by := NULL;
    new.reserve_resolution  := NULL;
    new.reserve_fixed_at := NULL;
    new.reserve_fixed_by := NULL;
    new.reserve_fix_note := NULL;
    IF new.user_id IS DISTINCT FROM auth.uid() THEN
      new.status := 'draft';
    END IF;
  ELSE
    new.user_id      := old.user_id;
    new.company_id   := old.company_id;
    new.work_date    := old.work_date;
    new.locked       := old.locked;
    new.exported_at  := old.exported_at;
    new.validated_at := old.validated_at;
    new.validated_by := old.validated_by;
    new.client_id    := old.client_id;
    new.reserve_resolved_at := old.reserve_resolved_at;
    new.reserve_resolved_by := old.reserve_resolved_by;
    new.reserve_resolution  := old.reserve_resolution;

    IF current_setting('bemexo.allow_reserve_fix', true) IS DISTINCT FROM '1' THEN
      new.reserve_fixed_at := old.reserve_fixed_at;
      new.reserve_fixed_by := old.reserve_fixed_by;
      new.reserve_fix_note := old.reserve_fix_note;
    END IF;

    IF old.user_id IS DISTINCT FROM auth.uid() THEN
      new.status := old.status;
    END IF;

    IF old.status = 'submitted' AND new.status = 'draft' THEN
      RAISE EXCEPTION 'time_entries: une journée envoyée ne redevient pas brouillon (retirez-la ou corrigez-la)';
    END IF;
    IF old.status = 'cancelled' AND new.status <> 'cancelled' THEN
      RAISE EXCEPTION 'time_entries: une intervention retirée ne se réactive pas';
    END IF;

    IF old.status = 'submitted' AND (
         new.status = 'cancelled'
      OR (new.start_time, new.end_time, new.break_minutes, new.meal_allowance, new.observation, new.reception, new.worksite_id, new.photos, new.gap_before)
         IS DISTINCT FROM
         (old.start_time, old.end_time, old.break_minutes, old.meal_allowance, old.observation, old.reception, old.worksite_id, old.photos, old.gap_before)
    ) THEN
      new.modified_at := now();
      new.modified_by := auth.uid();
    ELSE
      new.modified_at := old.modified_at;
      new.modified_by := old.modified_by;
    END IF;

    IF new.status = 'submitted' AND old.status = 'draft' THEN
      new.submitted_at := now();
    ELSE
      new.submitted_at := old.submitted_at;
    END IF;
  END IF;

  IF new.worksite_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.worksites w
       WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'time_entries: chantier hors de votre entreprise';
  END IF;
  RETURN new;
END;
$fn$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · CORRIGER ET INSCRIRE, EN UN SEUL GESTE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI UNE FONCTION, ET PAS DEUX APPELS DEPUIS LE NAVIGATEUR. Parce que
-- deux appels ne sont pas une opération : entre les deux, tout peut arriver.
-- Si l'écriture des heures passe et que le journal échoue — réseau coupé, ou
-- simplement cette migration pas encore appliquée — les heures changent SANS
-- trace et SANS notification. C'est-à-dire exactement l'état que cette étape
-- existe pour supprimer.
--
-- Ici, les deux écritures vivent dans la même transaction : soit les deux, soit
-- aucune. Tant que cette migration n'est pas passée, la fonction n'existe pas,
-- l'appel échoue, et RIEN N'EST MODIFIÉ. Le code client qui l'appelle est donc
-- sûr même livré en avance — il refuse de corriger plutôt que de corriger en
-- silence.
--
-- SECURITY INVOKER, volontairement. La fonction n'ajoute AUCUN droit : les deux
-- écritures passent par les policies existantes, qui décident déjà qui peut
-- corriger quoi. Une fonction SECURITY DEFINER aurait créé une seconde autorité
-- à maintenir en accord avec la première.
CREATE OR REPLACE FUNCTION public.correct_time_entry(
  p_entry_id uuid,
  p_start    time,
  p_end      time
)
 RETURNS TABLE(correction_id uuid, worker_id uuid, work_date date,
               old_start time, old_end time, new_start time, new_end time,
               corrected_by_role text)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $fn$
DECLARE
  e     record;
  v_role text;
  v_id  uuid;
BEGIN
  SELECT t.id, t.user_id, t.company_id, t.work_date, t.start_time, t.end_time, t.exported_at
    INTO e
    FROM public.time_entries t
   WHERE t.id = p_entry_id;
  IF e IS NULL THEN
    RAISE EXCEPTION 'Cette ligne n''existe pas, ou vous n''y avez pas accès.';
  END IF;

  IF (e.start_time, e.end_time) IS NOT DISTINCT FROM (p_start, p_end) THEN
    RAISE EXCEPTION 'Ces heures sont déjà celles-là.';
  END IF;

  -- On ne corrige pas ses propres heures par ce chemin : le salarié a son
  -- écran, et se notifier soi-même n'a pas de sens.
  IF e.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Ce chemin sert à corriger les heures de quelqu''un d''autre.';
  END IF;

  v_role := CASE WHEN public.is_admin() THEN 'admin'
                 WHEN public.is_my_team_member(e.user_id, e.work_date) THEN 'lead'
                 ELSE NULL END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de corriger les heures de cette personne.';
  END IF;

  -- L'écriture passe par la RLS : c'est elle qui tranche vraiment. Zéro ligne
  -- touchée n'est pas un succès.
  --
  -- ON N'ÉCRIT PAS `total_minutes`, ET CE N'EST PAS UN OUBLI. La colonne est
  -- GENERATED ALWAYS — Postgres la recalcule depuis end_time - start_time, avec
  -- le cas de la nuit (+1440) et le retrait de break_minutes. Y toucher serait
  -- refusé, et la recopier ailleurs créerait un deuxième calcul à maintenir.
  -- Vérifié en base plutôt que supposé : c'est la seule raison pour laquelle
  -- corriger deux heures suffit à corriger le total.
  UPDATE public.time_entries
     SET start_time = p_start, end_time = p_end
   WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette ligne n''a pas pu être corrigée.';
  END IF;

  INSERT INTO public.time_entry_corrections
    (company_id, entry_id, worker_id, work_date, corrected_by, corrected_by_role,
     old_start, old_end, new_start, new_end, was_exported)
  VALUES
    (e.company_id, e.id, e.user_id, e.work_date, auth.uid(), v_role,
     e.start_time, e.end_time, p_start, p_end, e.exported_at IS NOT NULL)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, e.user_id, e.work_date,
                      e.start_time, e.end_time, p_start, p_end, v_role;
END;
$fn$;

-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE J'AI ENVISAGÉ ET ÉCARTÉ
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ÉCRIRE L'HISTORIQUE DEPUIS UN TRIGGER sur time_entries, plutôt que depuis le
-- client. Tentant : impossible à oublier. Mais un trigger ne sait pas
-- distinguer une correction d'heures d'un changement de chantier, d'un envoi,
-- d'une levée de réserve — il inscrirait une « correction » à chaque écriture,
-- et le salarié recevrait une notification pour chaque geste du bureau. La
-- décision « ceci est une correction qu'il faut annoncer » est une décision de
-- produit, pas une conséquence mécanique d'un UPDATE.
--
-- RENDRE LA NOTIFICATION OBLIGATOIRE EN BASE (refuser la correction si l'envoi
-- échoue). Écarté : cela ferait dépendre une écriture de paie de la
-- disponibilité d'un service de push. Une correction juste doit passer même
-- quand le téléphone du salarié est éteint. L'exigence est qu'un échec soit
-- VISIBLE, pas qu'il soit bloquant — d'où `notified_at IS NULL`, lisible par le
-- bureau comme par le salarié.
