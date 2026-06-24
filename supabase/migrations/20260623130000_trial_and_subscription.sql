-- 2026-06-23 — Lot 4 : essai 30 j + colonnes d'abonnement (préparation Stripe).
-- Appliqué en production (projet sdperbcquvneohotjono). Versionné pour le staging.
--
-- N'affecte QUE les nouvelles inscriptions (l'entreprise existante reste
-- trial_ends_at NULL = pas d'essai / illimité). Le blocage à l'expiration est
-- géré côté front et N'EST ACTIF QU'EN PREVIEW tant que Stripe n'est pas branché.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- handle_new_user : pose trial_ends_at = now()+30j à la création de l'entreprise.
-- (Identique à l'existant, seule la ligne INSERT companies change.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_first_name text;
  v_last_name text;
  v_role public.battime_role;
BEGIN
  v_company_name := nullif(new.raw_user_meta_data ->> 'company_name', '');
  v_first_name := nullif(new.raw_user_meta_data ->> 'first_name', '');
  v_last_name := nullif(new.raw_user_meta_data ->> 'last_name', '');
  v_role := COALESCE((nullif(new.raw_user_meta_data ->> 'role', ''))::public.battime_role, 'worker'::public.battime_role);

  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.companies (name, trial_ends_at)
    VALUES (v_company_name, now() + interval '30 days')
    RETURNING id INTO v_company_id;
    v_role := 'admin'::public.battime_role;
  ELSE
    v_company_id := nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid;
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: missing company_name or company_id in user metadata for user id %', new.id;
    END IF;
  END IF;

  INSERT INTO public.users (id, company_id, first_name, last_name, role, email, phone)
  VALUES (
    new.id, v_company_id, v_first_name, v_last_name, v_role,
    nullif(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );

  RETURN new;
END;
$function$;
