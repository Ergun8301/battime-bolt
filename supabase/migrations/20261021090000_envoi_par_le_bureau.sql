-- « Envoyer à sa place » : le patron ou la secrétaire envoie les heures d'un salarié qui ne l'a pas fait.
--
-- Trace : qui a envoyé. `submitted_by` reste VIDE quand c'est le salarié lui-même qui envoie (tout l'existant, aucune ligne modifiée) ; il porte l'identifiant
-- de la personne du bureau quand elle envoie à la place du salarié. La fiche d'une ligne affiche alors « Envoyée par le bureau ».
--
-- AJOUT PUR : une colonne facultative, aucun déclencheur, aucune règle d'accès touchée (le droit d'écrire est celui de la règle `time_entries_admin_all_mutations`
-- qui existe déjà pour l'administrateur de l'entreprise). Sans cette colonne, l'application refuse d'envoyer à la place (elle ne le fait jamais sans trace).
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.time_entries.submitted_by IS
  'Personne du bureau qui a envoyé ces heures à la place du salarié (NULL = envoyées par le salarié lui-même).';
