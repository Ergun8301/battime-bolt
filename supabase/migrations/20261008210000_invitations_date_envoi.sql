-- Invitations en attente : l'e-mail d'invitation est-il déjà parti, et quand ?
--
-- Le bureau affiche « Envoyer l'invitation » (jamais envoyée) ou « Invitée le
-- JJ/MM · Renvoyer ». La seule trace fiable de l'envoi est auth.users.invited_at,
-- que Supabase pose à chaque e-mail d'invitation (et met à jour à chaque renvoi).
-- Un compte créé SANS e-mail (préparation d'une équipe avant le lancement) a
-- invited_at vide : c'est exactement « jamais envoyée ».
--
-- LECTURE SEULE, ajout pur : aucune table ni donnée modifiée. Réservé à
-- l'administrateur actif de l'entreprise, et limité à SES invitations en attente
-- (même périmètre que la règle d'accès de la table invitations).
--
-- DÉJÀ APPLIQUÉE en production le 8 octobre 2026 (avant la vérification de la
-- préview, qui lit la base de production). Sans elle, l'écran le dit (« Dates
-- d'envoi indisponibles ») et bloque l'envoi groupé.

create or replace function public.pending_invitations_sent_at()
returns table (email text, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, au.invited_at
  from public.invitations i
  join auth.users au on lower(au.email) = lower(i.email)
  where i.accepted_at is null
    and i.company_id = (
      select u.company_id
      from public.users u
      where u.id = (select auth.uid())
        and u.role = 'admin'::public.battime_role
        and coalesce(u.is_active, true)
    );
$$;

revoke all on function public.pending_invitations_sent_at() from public, anon;
grant execute on function public.pending_invitations_sent_at() to authenticated;
