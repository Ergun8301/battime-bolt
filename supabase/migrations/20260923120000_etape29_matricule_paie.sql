-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 29 — LE MATRICULE DE PAIE
--
-- Pourquoi cette colonne existe
-- ─────────────────────────────
-- Le CSV de paie s'adresse à un logiciel (Silae, Sage, Cegid, EBP, Quadra),
-- pas à un lecteur. Ces logiciels ne rattachent JAMAIS une ligne à un salarié
-- par son nom : ils la rattachent par son MATRICULE, le numéro que le cabinet
-- lui a attribué. Sans matricule, l'import se fait à la main, ligne à ligne —
-- et deux homonymes suffisent à verser les heures de l'un sur le bulletin de
-- l'autre.
--
-- Ce qu'on ne fait PAS
-- ────────────────────
-- On ne génère pas le matricule. Il n'appartient pas à BEMEXO : il est décidé
-- par le cabinet comptable et il doit être recopié tel quel, y compris ses
-- zéros de tête (« 00042 » n'est pas « 42 »). D'où `text`, jamais un entier —
-- un entier mangerait les zéros et casserait l'import silencieusement.
--
-- Ce que le CSV fait quand elle est vide
-- ──────────────────────────────────────
-- La colonne « Matricule » sort vide. Elle ne sort pas fausse, et l'export ne
-- s'arrête pas : des heures ne se retiennent pas parce qu'un numéro manque.
-- Le comptable complète une fois, à son premier import.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) La colonne ───────────────────────────────────────────────────────────
ALTER TABLE public.user_payroll
  ADD COLUMN IF NOT EXISTS payroll_id text;

COMMENT ON COLUMN public.user_payroll.payroll_id IS
  'Matricule de paie attribué par le cabinet comptable. Recopié tel quel, '
  'zéros de tête compris — d''où text et non un entier. Sert de clé dans le '
  'CSV de paie. Vide = colonne vide dans l''export, jamais un numéro inventé.';

-- ── 2) Un matricule ne peut pas désigner deux salariés ──────────────────────
-- Dans une MÊME entreprise. D'une entreprise à l'autre, « 001 » est libre.
-- Index partiel : les matricules vides, eux, restent tous permis.
CREATE UNIQUE INDEX IF NOT EXISTS user_payroll_matricule_unique
  ON public.user_payroll (company_id, payroll_id)
  WHERE payroll_id IS NOT NULL AND btrim(payroll_id) <> '';

-- ── 3) Rien à faire côté droits ─────────────────────────────────────────────
-- user_payroll porte déjà sa RLS (le bureau lit et écrit la sienne, le salarié
-- ne voit que sa ligne). Une colonne ajoutée hérite des policies de la table :
-- il n'y a ni GRANT ni policy à écrire ici. On le vérifie plutôt que de le
-- croire — voir le contrôle d'application ci-dessous.

-- ════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION (à passer en `authenticated`, pas en postgres) :
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema='public' and table_name='user_payroll'
--      and column_name='payroll_id';
--   -- attendu : payroll_id | text
--
--   select indexname from pg_indexes
--    where schemaname='public' and indexname='user_payroll_matricule_unique';
--   -- attendu : une ligne
--
--   -- Et la preuve par le comportement, dans une transaction qui s'annule :
--   begin;
--     insert into public.user_payroll (user_id, company_id, payroll_id)
--     values ('<un salarié>', '<sa boîte>', '00042');
--     insert into public.user_payroll (user_id, company_id, payroll_id)
--     values ('<un autre>',   '<même boîte>', '00042');   -- doit lever 23505
--   rollback;
-- ════════════════════════════════════════════════════════════════════════════
