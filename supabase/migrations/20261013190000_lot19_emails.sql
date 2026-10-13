-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 19 (oct. 2026) — E-MAILS DU BUREAU : PLANNING DE LA SEMAINE, MESSAGES,
--                      PLAFOND PAR JOUR, JOURNAL, DÉSABONNEMENTS
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin) — DEUX niveaux.
--
-- 1) DOUX (conseillé) : on retire seulement les trois fonctions. La fonction edge
--    `send-staff-email` répond alors « pas encore disponible » (le bouton du
--    bureau se cache sans message d'erreur) et AUCUN e-mail ne part. Le journal et
--    la liste des désabonnés sont GARDÉS (rien n'est effacé). Pour l'exécuter :
--    copier les lignes ENTRE « DÉBUT » et « FIN » en retirant au début de chaque
--    ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP FUNCTION IF EXISTS public.staff_email_finish(uuid, uuid, text, text);
-- DROP FUNCTION IF EXISTS public.staff_email_reserve(uuid, uuid, text, integer, jsonb);
-- DROP FUNCTION IF EXISTS public.staff_email_used_today(uuid);
-- ── FIN DU RETOUR ARRIÈRE ──
--
-- 2) COMPLET (à n'utiliser qu'en connaissance de cause) : en plus, on retire les
--    deux tables. ⚠ On PERD alors le journal des envois ET la liste des personnes
--    désabonnées des nouvelles familles : si la fonction edge est redéployée plus
--    tard, ces personnes pourraient de nouveau recevoir un e-mail. L'ancienne table
--    `email_unsubscribes` (quatre familles) n'est JAMAIS touchée par ce fichier.
-- ── DÉBUT DU RETOUR ARRIÈRE COMPLET ──
-- DROP FUNCTION IF EXISTS public.staff_email_finish(uuid, uuid, text, text);
-- DROP FUNCTION IF EXISTS public.staff_email_reserve(uuid, uuid, text, integer, jsonb);
-- DROP FUNCTION IF EXISTS public.staff_email_used_today(uuid);
-- DROP TABLE IF EXISTS public.staff_email_log;
-- DROP TABLE IF EXISTS public.email_unsubscribes_v2;
-- ── FIN DU RETOUR ARRIÈRE COMPLET ──
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 9 × true :
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff_email_log'
--      AND column_name IN ('id', 'company_id', 'kind', 'user_id', 'recipient_mask', 'recipient_hash', 'content_hash', 'day', 'status', 'reason', 'sent_by', 'created_at', 'finished_at')) = 13 AS v1_journal_colonnes,
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_unsubscribes_v2'
--      AND column_name IN ('email', 'kind', 'created_at')) = 3 AS v2_desabonnements_colonnes,
--   (SELECT count(*) FROM pg_class WHERE oid IN ('public.staff_email_log'::regclass, 'public.email_unsubscribes_v2'::regclass) AND relrowsecurity) = 2 AS v3_rls_active_deux_tables,
--   has_table_privilege('authenticated', 'public.staff_email_log', 'SELECT')
--   AND NOT has_table_privilege('authenticated', 'public.staff_email_log', 'INSERT')
--   AND NOT has_table_privilege('authenticated', 'public.staff_email_log', 'UPDATE')
--   AND NOT has_table_privilege('anon', 'public.staff_email_log', 'SELECT')
--   AND NOT has_table_privilege('anon', 'public.staff_email_log', 'INSERT') AS v4_journal_lu_par_le_bureau_ecrit_par_personne,
--   NOT has_table_privilege('authenticated', 'public.email_unsubscribes_v2', 'SELECT')
--   AND NOT has_table_privilege('authenticated', 'public.email_unsubscribes_v2', 'INSERT')
--   AND NOT has_table_privilege('anon', 'public.email_unsubscribes_v2', 'SELECT')
--   AND NOT has_table_privilege('anon', 'public.email_unsubscribes_v2', 'INSERT') AS v5_desabonnements_fermes_au_navigateur,
--   has_table_privilege('service_role', 'public.staff_email_log', 'SELECT')
--   AND has_table_privilege('service_role', 'public.email_unsubscribes_v2', 'INSERT') AS v6_cle_service_ecrit,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('staff_email_log', 'email_unsubscribes_v2')) = 1
--   AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_email_log' AND policyname = 'staff_email_log_admin_select' AND cmd = 'SELECT') AS v7_une_seule_regle_lecture_bureau,
--   (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('staff_email_reserve', 'staff_email_finish', 'staff_email_used_today')
--      AND prosecdef AND proconfig @> ARRAY['search_path=""']) = 3
--   AND NOT has_function_privilege('anon', 'public.staff_email_reserve(uuid, uuid, text, integer, jsonb)', 'EXECUTE')
--   AND NOT has_function_privilege('authenticated', 'public.staff_email_reserve(uuid, uuid, text, integer, jsonb)', 'EXECUTE')
--   AND NOT has_function_privilege('authenticated', 'public.staff_email_finish(uuid, uuid, text, text)', 'EXECUTE')
--   AND NOT has_function_privilege('authenticated', 'public.staff_email_used_today(uuid)', 'EXECUTE')
--   AND has_function_privilege('service_role', 'public.staff_email_reserve(uuid, uuid, text, integer, jsonb)', 'EXECUTE') AS v8_fonctions_chemin_vide_service_seulement,
--   (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.email_unsubscribes'::regclass AND contype = 'c'
--      AND pg_get_constraintdef(oid) LIKE '%weekly-digest%' AND pg_get_constraintdef(oid) LIKE '%budget-alerts%') = 1 AS v9_ancienne_table_a_ses_quatre_familles;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261013190000', 'lot19_emails') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : le bureau peut maintenant envoyer par e-mail (1) le planning de la
-- semaine d'un salarié, en PDF joint, et (2) un court message. Ces envois partent
-- d'une fonction edge neuve (`send-staff-email`) et ont besoin de trois choses que
-- la base ne donnait pas encore :
--   · un PLAFOND par entreprise et par jour, vérifié et décompté de façon sûre
--     même si deux demandes arrivent en même temps ;
--   · un JOURNAL des envois, lisible par le bureau de l'entreprise (qui, quand,
--     quel type, quel résultat) — jamais le texte du message ni la pièce jointe ;
--   · des DÉSABONNEMENTS pour les deux nouvelles familles d'e-mails
--     ('planning-hebdo', 'message-bureau').
--
-- POURQUOI UNE NOUVELLE TABLE DE DÉSABONNEMENTS. L'ancienne (`email_unsubscribes`)
-- porte un CHECK qui ne laisse passer que quatre familles. L'étendre voudrait dire
-- retirer cette contrainte, ce que nos migrations s'interdisent. `email_unsubscribes_v2`
-- n'a donc AUCUN CHECK sur la liste des familles (seulement sur la forme du mot) :
-- la liste blanche vit dans supabase/functions/_shared/email.ts. L'ancienne table et
-- ses quatre familles ne bougent pas ; la fonction `email-unsubscribe` écrit dans
-- l'une ou l'autre selon la famille, et les envois lisent celle qui convient.
--
-- CE QUE FAIT LE FICHIER (100 % ADDITIF : deux tables, trois fonctions) :
--   1) email_unsubscribes_v2 : une adresse + une famille. Fermée au navigateur.
--   2) staff_email_log : une ligne par e-mail tenté. Destinataire MASQUÉ
--      (« j***@example.com ») et HACHÉ (SHA-256, salé par l'entreprise) ; contenu
--      HACHÉ seulement (sert à reconnaître « même contenu, même personne, même
--      minute »). Statut : reserved (place prise, envoi en cours), sent, failed
--      (refusé : ne compte plus dans le plafond), uncertain (réponse perdue : peut
--      être parti, compte dans le plafond). Lecture : le bureau de SON entreprise.
--   3) staff_email_reserve : prend les places AVANT l'envoi, sous un verrou propre
--      à l'entreprise (une seule demande à la fois par entreprise). C'est ce verrou
--      qui garantit le plafond même en rafale. Écarte aussi les doublons de moins
--      d'une minute. Le plafond est passé par la fonction edge (constante unique
--      DAILY_EMAIL_CAP dans supabase/functions/_shared/staff-email-core.ts).
--   4) staff_email_finish : note le résultat (sent / failed / uncertain) d'une place.
--   5) staff_email_used_today : combien d'envois comptent aujourd'hui (jour de Paris).
--
-- DROITS. Les deux tables et les trois fonctions sont FERMÉES au navigateur : seule
-- la clé service (fonction edge) écrit. Le bureau lit le journal par une règle de
-- ligne (son entreprise, et lui seul : ni salarié, ni chef d'équipe, ni support).
-- Les objets neufs reçoivent par défaut TOUS les droits pour anon et authenticated
-- en production (pg_default_acl) : ils sont repris ci-dessous.
--
-- AVANT CE FICHIER : rien ne change. La fonction `send-staff-email` répond « pas
-- encore disponible » (table absente) et le bureau ne voit aucune erreur.
-- Rejouable : IF NOT EXISTS / CREATE OR REPLACE partout, règle de ligne posée une fois.
--
-- Testée sur un Postgres jetable : npm run test:emails-db
-- (supabase/tests/lot19_emails.mjs) — droits par défaut de production, chargée deux
-- fois, abus (salarié, autre entreprise, anonyme), rafale, retours arrière.
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';

-- ── 1) Désabonnements des nouvelles familles ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_unsubscribes_v2 (
  email      text        NOT NULL,
  kind       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, kind),
  -- Toujours en minuscules : c'est la forme comparée par les fonctions.
  CHECK (email = lower(btrim(email))),
  -- La FORME seulement (un mot en minuscules et tirets) : pas de liste fermée.
  CHECK (kind ~ '^[a-z][a-z0-9-]{1,39}$')
);
COMMENT ON TABLE public.email_unsubscribes_v2 IS
  'Lot 19 : désabonnements des familles d''e-mails ajoutées depuis le lot 19 (planning-hebdo, message-bureau). Même rôle que email_unsubscribes, SANS liste fermée de familles (la liste blanche est dans _shared/email.ts). Écrite par la fonction email-unsubscribe, lue par les envois, fermée au navigateur.';
ALTER TABLE public.email_unsubscribes_v2 ENABLE ROW LEVEL SECURITY;
-- La clé service lit et écrit, sans pouvoir effacer : on retire ses droits par défaut puis on rend les trois utiles.
REVOKE ALL ON public.email_unsubscribes_v2 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.email_unsubscribes_v2 TO service_role;

-- ── 2) Le journal des envois ────────────────────────────────────────────────
-- Pas de clé étrangère : une entreprise ou un salarié retiré ne doit ni bloquer ni
-- effacer l'historique des envois (les liens sont de simples identifiants).
CREATE TABLE IF NOT EXISTS public.staff_email_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL,
  kind           text        NOT NULL CHECK (kind ~ '^[a-z][a-z0-9-]{1,39}$'),
  -- Le salarié destinataire (identifiant interne, pas l'adresse).
  user_id        uuid,
  recipient_mask text        NOT NULL CHECK (char_length(recipient_mask) BETWEEN 1 AND 120),
  recipient_hash text        NOT NULL CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
  content_hash   text        NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  -- Le jour de Paris : le plafond repart à zéro à minuit, heure de Paris.
  day            date        NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Paris')::date),
  status         text        NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'sent', 'failed', 'uncertain')),
  -- Un code court (ex. « refus-service »), jamais un texte libre.
  reason         text        CHECK (reason IS NULL OR reason ~ '^[a-z0-9_.-]{1,60}$'),
  sent_by        uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
CREATE INDEX IF NOT EXISTS staff_email_log_day_idx    ON public.staff_email_log (company_id, day);
CREATE INDEX IF NOT EXISTS staff_email_log_dup_idx    ON public.staff_email_log (company_id, recipient_hash, content_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_email_log_recent_idx ON public.staff_email_log (company_id, created_at DESC);
COMMENT ON TABLE public.staff_email_log IS
  'Lot 19 : une ligne par e-mail du bureau (planning de la semaine, message) tenté par la fonction send-staff-email. Destinataire masqué + haché, contenu haché, jamais le texte ni la pièce jointe. Écrite par staff_email_reserve / staff_email_finish seulement. Lue par le bureau de l''entreprise.';

ALTER TABLE public.staff_email_log ENABLE ROW LEVEL SECURITY;
-- Le bureau lit ; la clé service lit et écrit SANS pouvoir effacer (le journal est une preuve).
REVOKE ALL ON public.staff_email_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.staff_email_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_email_log TO service_role;

-- Lecture : le bureau de l'entreprise, et lui seul (ni le salarié, ni le chef
-- d'équipe, ni support_read — comme hours_reminders). Aucune règle d'écriture.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_email_log' AND policyname = 'staff_email_log_admin_select') THEN
    CREATE POLICY staff_email_log_admin_select ON public.staff_email_log FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() AND public.is_admin());
  END IF;
END $do$;

-- ── 3) Prendre des places AVANT d'envoyer (plafond + doublons) ──────────────
-- p_items : [{ "user_id": uuid|null, "mask": "j***@example.com", "rhash": 64 hex, "chash": 64 hex }, …]
-- Réponse : { cap, used_before, used_after, items: [{ i, result: reserved|duplicate|cap, id }] }
--   reserved  = place prise (id = la ligne du journal) : la fonction peut envoyer ;
--   duplicate = même personne, même contenu, il y a moins d'une minute : à ne pas renvoyer ;
--   cap       = plafond du jour atteint : à ne pas envoyer.
-- UN SEUL passage à la fois par entreprise (verrou de transaction) : deux demandes
-- simultanées se mettent en file, la seconde voit les places prises par la première.
CREATE OR REPLACE FUNCTION public.staff_email_reserve(
  p_company uuid, p_sent_by uuid, p_kind text, p_cap integer, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_day    date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_used   integer;
  v_before integer;
  v_it     jsonb;
  v_n      integer := 0;
  v_out    jsonb := '[]'::jsonb;
  v_id     uuid;
  v_res    text;
BEGIN
  IF p_company IS NULL OR p_kind IS NULL OR p_kind !~ '^[a-z][a-z0-9-]{1,39}$' THEN
    RAISE EXCEPTION 'staff_email_reserve : entreprise ou famille invalide';
  END IF;
  IF p_cap IS NULL OR p_cap < 1 OR p_cap > 1000 THEN
    RAISE EXCEPTION 'staff_email_reserve : plafond invalide';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'staff_email_reserve : liste invalide';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('staff_email:' || p_company::text, 0));

  SELECT count(*) INTO v_used FROM public.staff_email_log
   WHERE company_id = p_company AND day = v_day AND status <> 'failed';
  v_before := v_used;

  FOR v_it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_n := v_n + 1;
    v_id := NULL;
    IF jsonb_typeof(v_it) <> 'object'
       OR coalesce(v_it->>'rhash', '') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_it->>'chash', '') !~ '^[0-9a-f]{64}$'
       OR char_length(coalesce(v_it->>'mask', '')) NOT BETWEEN 1 AND 120
       OR coalesce(v_it->>'user_id', '') !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?$' THEN
      RAISE EXCEPTION 'staff_email_reserve : ligne % invalide', v_n;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.staff_email_log l
       WHERE l.company_id = p_company
         AND l.recipient_hash = v_it->>'rhash'
         AND l.content_hash = v_it->>'chash'
         AND l.status <> 'failed'
         AND l.created_at > now() - interval '60 seconds'
    ) THEN
      v_res := 'duplicate';
    ELSIF v_used >= p_cap THEN
      v_res := 'cap';
    ELSE
      INSERT INTO public.staff_email_log (company_id, kind, user_id, recipient_mask, recipient_hash, content_hash, day, sent_by)
      VALUES (p_company, p_kind, nullif(v_it->>'user_id', '')::uuid, v_it->>'mask', v_it->>'rhash', v_it->>'chash', v_day, p_sent_by)
      RETURNING id INTO v_id;
      v_used := v_used + 1;
      v_res := 'reserved';
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object('i', v_n, 'result', v_res, 'id', v_id));
  END LOOP;

  RETURN jsonb_build_object('cap', p_cap, 'used_before', v_before, 'used_after', v_used, 'items', v_out);
END
$fn$;

-- ── 4) Noter le résultat d'une place ────────────────────────────────────────
-- Une place ne change qu'UNE fois (reserved → sent / failed / uncertain) et
-- seulement pour l'entreprise qui l'a prise. Le motif est un code court.
CREATE OR REPLACE FUNCTION public.staff_email_finish(
  p_id uuid, p_company uuid, p_status text, p_reason text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'staff_email_finish : statut invalide';
  END IF;
  UPDATE public.staff_email_log
     SET status = p_status,
         reason = CASE WHEN p_reason ~ '^[a-z0-9_.-]{1,60}$' THEN p_reason END,
         finished_at = now()
   WHERE id = p_id AND company_id = p_company AND status = 'reserved';
  RETURN FOUND;
END
$fn$;

-- ── 5) Combien d'envois comptent aujourd'hui (jour de Paris) ────────────────
CREATE OR REPLACE FUNCTION public.staff_email_used_today(p_company uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  SELECT count(*)::integer FROM public.staff_email_log
   WHERE company_id = p_company
     AND day = (now() AT TIME ZONE 'Europe/Paris')::date
     AND status <> 'failed'
$fn$;

-- Fermées au navigateur : seule la clé service (fonction edge) les appelle.
REVOKE ALL ON FUNCTION public.staff_email_reserve(uuid, uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_email_finish(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_email_used_today(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_email_reserve(uuid, uuid, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_email_finish(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_email_used_today(uuid) TO service_role;
