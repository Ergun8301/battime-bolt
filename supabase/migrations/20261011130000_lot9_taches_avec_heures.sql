-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 9 (oct. 2026) — TÂCHES AVEC HEURE DE DÉBUT ET DE FIN
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin ; efface seulement les heures
-- des tâches, les tâches elles-mêmes et leur « Fait » restent) :
--   ALTER TABLE public.day_tasks DROP CONSTRAINT IF EXISTS day_tasks_times_check;
--   ALTER TABLE public.day_tasks DROP COLUMN IF EXISTS end_time, DROP COLUMN IF EXISTS start_time;
--
-- VÉRIFICATION APRÈS APPLICATION (doit renvoyer 6 × true) :
--   SELECT
--     (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'day_tasks'
--       AND column_name IN ('start_time', 'end_time') AND data_type = 'time without time zone'
--       AND is_nullable = 'YES' AND column_default IS NULL) = 2                                AS colonnes,
--     EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.day_tasks'::regclass
--             AND conname = 'day_tasks_times_check' AND contype = 'c')                        AS contrainte,
--     has_column_privilege('authenticated', 'public.day_tasks', 'start_time', 'INSERT')
--     AND has_column_privilege('authenticated', 'public.day_tasks', 'end_time', 'INSERT')
--     AND has_column_privilege('authenticated', 'public.day_tasks', 'text', 'INSERT')
--     AND has_column_privilege('authenticated', 'public.day_tasks', 'start_time', 'SELECT')    AS droits_bureau,
--     NOT has_column_privilege('authenticated', 'public.day_tasks', 'start_time', 'UPDATE')
--     AND NOT has_column_privilege('authenticated', 'public.day_tasks', 'end_time', 'UPDATE')
--     AND NOT has_column_privilege('authenticated', 'public.day_tasks', 'created_by', 'INSERT')
--     AND NOT has_column_privilege('authenticated', 'public.day_tasks', 'done_at', 'INSERT')   AS rien_de_plus,
--     NOT has_column_privilege('anon', 'public.day_tasks', 'start_time', 'SELECT')
--     AND NOT has_column_privilege('anon', 'public.day_tasks', 'start_time', 'INSERT')
--     AND NOT has_column_privilege('anon', 'public.day_tasks', 'end_time', 'INSERT')           AS anon_rien,
--     (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'day_tasks') = 3
--     AND NOT EXISTS (SELECT 1 FROM public.day_tasks WHERE start_time IS NOT NULL OR end_time IS NOT NULL) AS existant_intact;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261011130000', 'lot9_taches_avec_heures') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : une tâche du jour (lot 4) n'a qu'un moment facultatif (matin /
-- après-midi / soir). Le bureau veut pouvoir écrire « de 10:00 à 11:30 ».
--
-- CE QUI CHANGE :
--   · deux colonnes FACULTATIVES sur day_tasks : start_time, end_time (time,
--     NULL par défaut). Les deux ou aucune, et la fin après le début (pas de
--     tâche de nuit : une tâche reste dans la journée) ;
--   · le bureau peut les envoyer à l'insertion (droits PAR COLONNE, comme le
--     lot 4 : on AJOUTE ces deux colonnes, rien n'est retiré). Toujours aucun
--     droit UPDATE : une heure se corrige en retirant la tâche et en la remettant ;
--   · le salarié les LIT avec sa tâche (le droit SELECT de la table couvre les
--     colonnes neuves) et ne peut toujours rien écrire en direct ;
--   · les tâches habituelles (task_templates) restent sans heures.
--
-- 100 % ADDITIVE : deux colonnes neuves (nullables, sans défaut : aucune
-- réécriture de la table), une contrainte neuve qui ne porte que sur elles,
-- deux droits d'insertion neufs. Aucune policy, fonction ou trigger n'est
-- modifié ; les tâches existantes gardent start_time = end_time = NULL.
-- Rejouable (IF NOT EXISTS ; la contrainte n'est posée qu'une fois).
--
-- FONCTIONS QUI LISENT day_tasks : seule set_day_task_done (lot 4). Elle
-- renvoie la ligne entière (public.day_tasks) : la ligne rendue porte les deux
-- heures, sans changement de code ; cocher ne les touche pas. Aucune autre
-- fonction, ni l'impression, ni les assistants ne lisent cette table.
--
-- NE COMPTE JAMAIS COMME HEURES (règle du lot 4) : start_time / end_time ne
-- sont lus que pour l'AFFICHAGE d'une tâche. Totaux, export de paie, coûts,
-- statistiques, relances et borne ne lisent pas day_tasks.
--
-- AVANT APPLICATION : l'application fonctionne exactement comme aujourd'hui.
-- Elle relit les tâches sans les heures quand Postgres répond « colonne
-- absente » (42703), cache les champs « de … à … » et n'envoie jamais
-- start_time / end_time.
--
-- À SAVOIR (règle « DROP ou DELETE ») : DROP n'apparaît que dans le RETOUR
-- ARRIÈRE ci-dessus. Aucun DELETE.
--
-- Testée sur un Postgres jetable : npm run test:taches-heures-db
-- (supabase/tests/lot9_taches_avec_heures.mjs).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.day_tasks ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE public.day_tasks ADD COLUMN IF NOT EXISTS end_time time;

-- Les deux heures ou aucune ; la fin après le début.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.day_tasks'::regclass AND conname = 'day_tasks_times_check') THEN
    ALTER TABLE public.day_tasks ADD CONSTRAINT day_tasks_times_check CHECK (
      (start_time IS NULL AND end_time IS NULL)
      OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time));
  END IF;
END $do$;

COMMENT ON COLUMN public.day_tasks.start_time IS
  'Lot 9 : heure de début facultative (avec end_time, ou aucune des deux). Affichage seulement : jamais des heures travaillées.';
COMMENT ON COLUMN public.day_tasks.end_time IS
  'Lot 9 : heure de fin facultative, après start_time. Affichage seulement : jamais des heures travaillées.';

-- Droits PAR COLONNE (lot 4) : on ajoute les deux heures à l'insertion du bureau
-- (la policy day_tasks_admin_insert décide toujours QUI insère). Pas d'UPDATE.
GRANT INSERT (start_time, end_time) ON public.day_tasks TO authenticated;
