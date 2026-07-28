-- 2026-07-26 — Interrupteur d'envoi du récap hebdomadaire, par entreprise.
--
-- Motif concret : les comptes de démonstration utilisent des domaines fictifs
-- (ex. komilfo-demo.fr). Sans filtre, le cron du vendredi leur envoie un email
-- qui rebondit en dur chaque semaine — et les rebonds répétés dégradent la
-- réputation d'envoi de bemexo.com, donc la délivrabilité des VRAIS emails.
--
-- Défaut à `true` : aucune entreprise réelle, existante ou future, ne change de
-- comportement. On ne coupe explicitement que les comptes de démo.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.weekly_digest_enabled IS
  'false = pas de récap hebdo automatique (comptes de démo / domaines fictifs). Défaut true.';
