-- ════════════════════════════════════════════════════════════════════════════
-- DÉSABONNEMENT DES E-MAILS RÉCURRENTS
--
-- Pourquoi cette table existe
-- ─────────────────────────────
-- Gmail et Yahoo classent en spam les e-mails récurrents qui n'offrent pas de
-- désabonnement en un clic (en-têtes List-Unsubscribe + List-Unsubscribe-Post,
-- RFC 8058). Un clic sur « Se désabonner » dans la messagerie envoie un POST à
-- la fonction `email-unsubscribe`, qui inscrit l'adresse ici.
--
-- Pourquoi par ADRESSE et pas par entreprise
-- ──────────────────────────────────────────
-- Les réglages existants (weekly_digest_enabled, auto_reminder_enabled…) sont
-- ceux de l'entreprise, décidés par l'admin. Un salarié qui ne veut plus des
-- rappels par e-mail ne doit pas les couper pour toute l'équipe : on retient
-- donc SON adresse, pour UNE famille d'e-mails.
--
-- Ce que la table ne fait PAS
-- ───────────────────────────
-- Elle ne touche ni aux e-mails de connexion (inscription, invitation, mot de
-- passe), ni à l'export paie envoyé à la demande : ceux-là ne sont pas des
-- envois récurrents et ne se désabonnent pas.
--
-- Accès : fonctions serveur uniquement (clé service). RLS active, aucune
-- politique : ni l'application ni un visiteur ne la lisent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
  email      text        NOT NULL,
  kind       text        NOT NULL
             CHECK (kind IN ('weekly-digest', 'missing-days', 'cert-expiry', 'budget-alerts')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, kind),
  -- Toujours en minuscules : c'est la forme comparée par les fonctions.
  CHECK (email = lower(btrim(email)))
);

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_unsubscribes FROM anon, authenticated;
