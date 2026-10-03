// Lot 11 — « Clôturer jusqu'au… » (user_closures) rejoué POUR DE VRAI, sur un
// Postgres jetable en mémoire (PGlite, Postgres compilé en WebAssembly).
// Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:cloture-salarie        (PGLITE_DIR=… pour un autre dossier)
//
// PGlite n'est PAS une dépendance du projet : il vit dans un dossier jetable.
// Le schéma est un BOUCHON (tables réduites aux colonnes utiles), mais les
// fonctions EXISTANTES qui comptent sont recopiées de la PRODUCTION mot pour
// mot (get_my_company_id, is_admin, is_month_closed, guard_time_entry_write,
// guard_time_entry_delete, guard_active_session, guard_month_closure,
// mark_reserve_fixed) avec leurs policies RLS : le test prouve que la nouvelle
// migration s'ajoute à côté sans rien changer. Les migrations, elles, sont
// chargées TELLES QUELLES depuis supabase/migrations (lot 9 puis lot 11).
// Les requêtes « salarié / bureau » passent sous le rôle `authenticated`
// (RLS appliquée), auth.uid() lu dans un réglage comme le fait Supabase.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG9 = path.join(here, '..', 'migrations', '20261001120000_lot9_fin_pointage.sql');
const MIG = path.join(here, '..', 'migrations', '20261002120000_lot11_cloture_salarie.sql');
const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';

let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}

const SQL = fs.readFileSync(MIG, 'utf8');
const SQL9 = fs.readFileSync(MIG9, 'utf8');

const CO = 'c0000000-0000-0000-0000-000000000001';
const CO2 = 'c0000000-0000-0000-0000-000000000002';
const ADMIN = 'a0000000-0000-0000-0000-00000000000a';
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000c'; // 2e personne du bureau, même entreprise
const LUCAS = '10000000-0000-0000-0000-000000000001';
const NINA = '20000000-0000-0000-0000-000000000002';
const LEAD = '30000000-0000-0000-0000-000000000003';
const OTHER_ADMIN = 'b0000000-0000-0000-0000-00000000000b';
const WS = 'e0000000-0000-0000-0000-000000000001';
const E_OLD = 'f0000000-0000-0000-0000-000000000001'; // Lucas, avant-hier (jour clos)
const E_TODAY = 'f0000000-0000-0000-0000-000000000002'; // Lucas, aujourd'hui (ouvert)

// ─── Le bouchon : tables réduites + fonctions et policies de PRODUCTION ─────
const STUB = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.companies (id uuid PRIMARY KEY, position_tracking_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), role text,
  is_active boolean DEFAULT true, first_name text, last_name text);
CREATE TABLE public.worksites (id uuid PRIMARY KEY, company_id uuid);
CREATE TABLE public.month_closures (company_id uuid NOT NULL, month date NOT NULL, closed_at timestamptz DEFAULT now(),
  closed_by uuid, PRIMARY KEY (company_id, month));
CREATE TABLE public.active_sessions (
  user_id uuid PRIMARY KEY, company_id uuid NOT NULL, worksite_id uuid, planning_id uuid,
  work_date date NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
  start_lat numeric, start_lng numeric, start_accuracy_m integer, start_located_at timestamptz);
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, user_id uuid NOT NULL,
  worksite_id uuid, planning_id uuid, client_id uuid, work_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0, meal_allowance boolean NOT NULL DEFAULT false, status text NOT NULL,
  observation text, reception text, photos jsonb, gap_before integer,
  locked boolean NOT NULL DEFAULT false, exported_at timestamptz, validated_at timestamptz, validated_by uuid,
  modified_at timestamptz, modified_by uuid, submitted_at timestamptz,
  reserve_resolved_at timestamptz, reserve_resolved_by uuid, reserve_resolution text,
  reserve_fixed_at timestamptz, reserve_fixed_by uuid, reserve_fix_note text,
  total_minutes integer GENERATED ALWAYS AS (
    (CASE WHEN end_time >= start_time THEN (extract(epoch FROM end_time - start_time) / 60)::int
          ELSE (extract(epoch FROM end_time - start_time) / 60)::int + 1440 END) - break_minutes) STORED);
CREATE TABLE public.time_entry_positions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, company_id uuid, entry_id uuid, user_id uuid, work_date date,
  moment text, latitude numeric, longitude numeric, accuracy_m integer, captured_at timestamptz);

-- ── Définitions de PRODUCTION (lues le 02/10/2026, inchangées par le lot 11) ──
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$ SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() AND u.is_active IS DISTINCT FROM false LIMIT 1 $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
-- Bouchon : le chef d'équipe gère toute l'entreprise (la vraie règle regarde le planning).
CREATE FUNCTION public.is_my_team_member(p_user uuid, p_date date) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'lead') AND p_user IS DISTINCT FROM auth.uid() $$;
-- Bouchon lot 5 (pour exercer le bloc DO de la migration).
CREATE FUNCTION public.support_company_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT ARRAY[]::uuid[] $$;

CREATE FUNCTION public.is_month_closed(p_company uuid, p_date date)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.month_closures m
    WHERE m.company_id = p_company
      AND m.month = date_trunc('month', p_date)::date
  );
$function$;

CREATE FUNCTION public.guard_time_entry_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;

  IF public.is_admin() THEN
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
$function$;
CREATE TRIGGER time_entries_guard_write BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_write();

CREATE FUNCTION public.guard_time_entry_delete()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN old;
  END IF;
  IF public.is_month_closed(old.company_id, old.work_date) THEN
    RAISE EXCEPTION 'time_entries: le mois est clôturé par le bureau';
  END IF;
  RETURN old;
END;
$function$;
CREATE TRIGGER time_entries_guard_delete BEFORE DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_delete();

CREATE FUNCTION public.guard_active_session()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.worksites w
                 WHERE w.id = new.worksite_id AND w.company_id = new.company_id) THEN
    RAISE EXCEPTION 'active_sessions: chantier hors de votre entreprise';
  END IF;
  IF public.is_month_closed(new.company_id, new.work_date) THEN
    RAISE EXCEPTION 'active_sessions: le mois est clôturé par le bureau';
  END IF;
  RETURN new;
END;
$function$;
CREATE TRIGGER active_sessions_guard BEFORE INSERT OR UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_session();

CREATE FUNCTION public.guard_month_closure()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_qui text;
BEGIN
  SELECT string_agg(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ', ')
    INTO v_qui
  FROM public.active_sessions a
  JOIN public.users u ON u.id = a.user_id
  WHERE a.company_id = new.company_id
    AND date_trunc('month', a.work_date)::date = new.month;

  IF v_qui IS NOT NULL AND btrim(v_qui) <> '' THEN
    RAISE EXCEPTION 'Impossible de clôturer : % a un pointage encore ouvert sur ce mois. Sa journée doit être fermée avant.', v_qui;
  END IF;
  RETURN new;
END;
$function$;
CREATE TRIGGER month_closures_guard BEFORE INSERT ON public.month_closures
  FOR EACH ROW EXECUTE FUNCTION public.guard_month_closure();

CREATE FUNCTION public.mark_reserve_fixed(p_entry_id uuid, p_fixed boolean, p_note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_owner uuid;
  v_company uuid;
  v_reception text;
  v_resolved timestamptz;
  v_touched int;
BEGIN
  SELECT t.user_id, t.company_id, t.reception, t.reserve_resolved_at
    INTO v_owner, v_company, v_reception, v_resolved
  FROM public.time_entries t
  WHERE t.id = p_entry_id AND t.company_id = public.get_my_company_id();

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Intervention introuvable';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le salarié concerné peut déclarer avoir corrigé';
  END IF;
  IF v_reception IS DISTINCT FROM 'avec' THEN
    RAISE EXCEPTION 'Cette intervention ne porte pas de réserve';
  END IF;
  IF v_resolved IS NOT NULL THEN
    RAISE EXCEPTION 'Cette réserve a déjà été levée par le bureau';
  END IF;

  PERFORM set_config('bemexo.allow_reserve_fix', '1', true);

  UPDATE public.time_entries SET
    reserve_fixed_at = CASE WHEN p_fixed THEN now() ELSE NULL END,
    reserve_fixed_by = CASE WHEN p_fixed THEN auth.uid() ELSE NULL END,
    reserve_fix_note = CASE WHEN p_fixed THEN nullif(btrim(p_note), '') ELSE NULL END
  WHERE id = p_entry_id AND reserve_resolved_at IS NULL;

  GET DIAGNOSTICS v_touched = ROW_COUNT;
  PERFORM set_config('bemexo.allow_reserve_fix', '0', true);

  IF v_touched = 0 THEN
    RAISE EXCEPTION 'Cette réserve vient d''être levée par le bureau';
  END IF;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.mark_reserve_fixed(uuid, boolean, text) TO authenticated;

-- ── Policies RLS de PRODUCTION (time_entries, active_sessions, month_closures) ──
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.month_closures ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries, public.active_sessions, public.month_closures TO authenticated;
GRANT SELECT ON public.users, public.companies, public.worksites, public.time_entry_positions TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
CREATE POLICY time_entries_admin_all_mutations ON public.time_entries FOR ALL TO authenticated
  USING ((company_id = get_my_company_id()) AND is_admin()) WITH CHECK ((company_id = get_my_company_id()) AND is_admin());
CREATE POLICY time_entries_lead_insert ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_my_company_id()) AND (status = 'draft'::text) AND is_my_team_member(user_id, work_date));
CREATE POLICY time_entries_lead_update ON public.time_entries FOR UPDATE TO authenticated
  USING ((company_id = get_my_company_id()) AND (locked = false) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text])) AND is_my_team_member(user_id, work_date))
  WITH CHECK ((company_id = get_my_company_id()) AND (locked = false) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text])) AND is_my_team_member(user_id, work_date));
CREATE POLICY time_entries_select_company_admin_or_own_worker ON public.time_entries FOR SELECT TO authenticated
  USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid()) OR is_my_team_member(user_id, work_date)));
CREATE POLICY time_entries_worker_delete_own_draft ON public.time_entries FOR DELETE TO authenticated
  USING ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = 'draft'::text) AND (locked = false));
CREATE POLICY time_entries_worker_insert ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = 'draft'::text));
CREATE POLICY time_entries_worker_update ON public.time_entries FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text])) AND (locked = false))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'cancelled'::text])) AND (locked = false));
CREATE POLICY active_sessions_delete ON public.active_sessions FOR DELETE TO authenticated
  USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
CREATE POLICY active_sessions_insert_own ON public.active_sessions FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_my_company_id()));
CREATE POLICY active_sessions_select ON public.active_sessions FOR SELECT TO authenticated
  USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
CREATE POLICY month_closures_admin_write ON public.month_closures FOR ALL TO authenticated
  USING ((company_id = get_my_company_id()) AND is_admin())
  WITH CHECK ((company_id = get_my_company_id()) AND is_admin() AND ((closed_by IS NULL) OR (closed_by = auth.uid())));
CREATE POLICY month_closures_select_company ON public.month_closures FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- Bouchon de trigger (comme au lot 9) : c'est le serveur qui pose l'heure de prise.
CREATE FUNCTION public.stub_session_now() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.started_at := now(); RETURN new; END $$;
CREATE TRIGGER stub_session_now BEFORE INSERT ON public.active_sessions FOR EACH ROW EXECUTE FUNCTION public.stub_session_now();
`;

const DATA = `
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin',  true, 'Paul',  'Martin'),
  ('${ADMIN2}', '${CO}', 'admin', true, 'Sophie', 'Bureau'),
  ('${LUCAS}', '${CO}', 'worker', true, 'Lucas', 'Petit'),
  ('${NINA}', '${CO}', 'worker', true, 'Nina',  'Roux'),
  ('${LEAD}', '${CO}', 'lead',   true, 'Marc',  'Chef'),
  ('${OTHER_ADMIN}', '${CO2}', 'admin', true, 'Autre', 'Patron');
INSERT INTO public.worksites VALUES ('${WS}', '${CO}');
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };

const db = new PGlite();
await db.exec(STUB);
await db.exec(DATA);
// Empreinte des fonctions et policies EXISTANTES, avant la migration.
const EXISTING_FN = ['get_my_company_id', 'is_admin', 'is_month_closed', 'guard_time_entry_write', 'guard_time_entry_delete',
  'guard_active_session', 'guard_month_closure', 'mark_reserve_fixed'];
const fnPrint = async () => (await db.query(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [EXISTING_FN])).rows[0].s;
const polPrint = async () => (await db.query(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s
  FROM pg_policies WHERE tablename <> 'user_closures'`)).rows[0].s;
const trgPrint = async () => (await db.query(`SELECT string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname) AS s
  FROM pg_trigger WHERE NOT tgisinternal AND tgname NOT IN ('time_entries_guard_user_closure', 'active_sessions_guard_user_closure', 'user_closures_guard')`)).rows[0].s;
const before = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint() };

await db.exec(SQL9);
await db.exec(SQL);

// Jours de Paris : aujourd'hui, hier (= date de clôture D), avant-hier.
const days = (await db.query(`SELECT ((now() AT TIME ZONE 'Europe/Paris')::date)::text AS today,
  ((now() AT TIME ZONE 'Europe/Paris')::date - 1)::text AS d, ((now() AT TIME ZONE 'Europe/Paris')::date - 2)::text AS dm1,
  ((now() AT TIME ZONE 'Europe/Paris')::date + 1)::text AS tomorrow`)).rows[0];
const { today, d: D, dm1: DM1, tomorrow } = days;

// Données de départ, écrites par le système (auth.uid() nul).
await db.query(`INSERT INTO public.time_entries (id, company_id, user_id, worksite_id, work_date, start_time, end_time, status, reception)
  VALUES ($1, $3, $4, $5, $6, '08:00', '12:00', 'draft', 'avec'), ($2, $3, $4, $5, $7, '08:00', '12:00', 'draft', NULL)`,
[E_OLD, E_TODAY, CO, LUCAS, WS, DM1, today]);

// ─── Outils : jouer une requête en tant que quelqu'un, sous RLS ─────────────
const as = async (uid) => {
  await db.exec(`RESET ROLE`);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  if (uid) await db.exec(`SET ROLE authenticated`);
};
const asService = async () => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); await db.exec(`SET ROLE service_role`); };
const asAnon = async () => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); await db.exec(`SET ROLE anon`); };
const run = async (sql, params = []) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } };
const refused = async (sql, params, needle, label) => {
  const r = await run(sql, params);
  const good = !r.ok && (needle instanceof RegExp ? needle.test(r.err) : r.err.includes(needle));
  check(good, `${label}${r.ok ? ' — ACCEPTÉ à tort' : good ? ` (« ${r.err} »)` : ` — refus inattendu : « ${r.err} »`}`);
  return r;
};
const accepted = async (sql, params, label) => {
  const r = await run(sql, params);
  check(r.ok, `${label}${r.ok ? '' : ` — refusé : « ${r.err} »`}`);
  return r;
};
const one = async (sql, params = []) => { await db.exec(`RESET ROLE`); const r = await db.query(sql, params); return r.rows[0]; };
const CLOSE = `INSERT INTO public.user_closures (user_id, company_id, closed_until, closed_by) VALUES ($1, $2, $3::date, $4)`;
// L'upsert tel que l'envoie supabase-js (lib/worker-closure.ts → closeWorkerUntil).
const UPSERT = `INSERT INTO public.user_closures (user_id, company_id, closed_until, closed_by, closed_at, reopened_at)
  VALUES ($1, $2, $3::date, $4, now(), NULL)
  ON CONFLICT (user_id) DO UPDATE SET company_id = excluded.company_id, closed_until = excluded.closed_until,
    closed_by = excluded.closed_by, closed_at = excluded.closed_at, reopened_at = excluded.reopened_at`;
// « Rouvrir » tel que l'envoie lib/worker-closure.ts → reopenWorker.
const REOPEN = `UPDATE public.user_closures SET reopened_at = now() WHERE company_id = $1 AND user_id = $2 AND reopened_at IS NULL RETURNING user_id`;

// ═══ Qui peut clôturer ═════════════════════════════════════════════════════
await as(LUCAS);
await refused(CLOSE, [LUCAS, CO, D, LUCAS], 'row-level security', 'un salarié ne se clôture pas lui-même');
await as(LEAD);
await refused(CLOSE, [LUCAS, CO, D, LEAD], 'row-level security', 'un chef d’équipe ne clôture pas');
await as(OTHER_ADMIN);
await refused(CLOSE, [LUCAS, CO2, D, OTHER_ADMIN], 'row-level security', 'le patron d’une autre entreprise ne clôture pas Lucas');
await refused(CLOSE, [LUCAS, CO, D, OTHER_ADMIN], 'row-level security', 'ni en se faisant passer pour l’entreprise de Lucas');
await as(ADMIN);
await refused(CLOSE, [LUCAS, CO, D, NINA], 'row-level security', 'closed_by = celui qui agit, jamais un autre (falsifié refusé)');
await refused(CLOSE, [LUCAS, CO, tomorrow, ADMIN], 'après aujourd', 'pas de clôture dans le futur (demain refusé)');

// Lucas a un chrono ouvert AUJOURD'HUI : clôturer jusqu'à aujourd'hui est refusé.
await as(LUCAS);
await accepted(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, $4::date)`,
  [LUCAS, CO, WS, today], 'Lucas démarre un pointage aujourd’hui (avant toute clôture)');
await as(ADMIN);
await refused(CLOSE, [LUCAS, CO, today, ADMIN], 'Lucas Petit a un pointage encore ouvert',
  'pas de clôture sur un pointage ouvert (sinon « J’ai fini » serait bloqué)');

// Jusqu'à HIER : le chrono d'aujourd'hui n'est pas concerné → accepté.
await accepted(UPSERT, [LUCAS, CO, D, ADMIN], 'le bureau clôture Lucas jusqu’à hier (upsert de l’écran)');
check((await one(`SELECT closed_until::text AS u, reopened_at, closed_by FROM public.user_closures WHERE user_id = $1`, [LUCAS])).u === D,
  'la date enregistrée est bien hier');

// ═══ Lecture ═══════════════════════════════════════════════════════════════
await as(LUCAS);
let r = await run(`SELECT user_id, closed_until::text AS u FROM public.user_closures`);
check(r.ok && r.rows.length === 1 && r.rows[0].u === D, 'Lucas lit SA clôture (pour savoir pourquoi c’est fermé)');
await as(NINA);
r = await run(`SELECT user_id FROM public.user_closures`);
check(r.ok && r.rows.length === 0, 'Nina (collègue) ne voit pas la date de fin de Lucas');
await as(OTHER_ADMIN);
r = await run(`SELECT user_id FROM public.user_closures`);
check(r.ok && r.rows.length === 0, 'le patron d’une autre entreprise ne voit rien');
await as(ADMIN2);
r = await run(`SELECT user_id FROM public.user_closures`);
check(r.ok && r.rows.length === 1, 'une autre personne du bureau la voit');
await as(NINA);
await refused(`SELECT public.user_closed_until($1)`, [LUCAS], 'permission denied', 'la lecture interne (qui contourne la RLS) n’est pas appelable par un salarié');
await asAnon();
await refused(`SELECT * FROM public.user_closures`, [], 'permission denied', 'anon : aucun accès à la table');

// ═══ Lucas : plus rien sur un jour clos ════════════════════════════════════
await as(LUCAS);
const ins = `INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '13:00', '17:00', 'draft')`;
const rIns = await refused(ins, [CO, LUCAS, WS, D], 'clôturé', 'Lucas : ajout le jour de la clôture refusé');
check(!rIns.ok && rIns.err.includes('jusqu') && rIns.err.includes(D.split('-').reverse().join('/')),
  `le message dit « clôturé … jusqu’au ${D.split('-').reverse().join('/')} » (reconnu par la borne et l’appli)`);
await refused(`UPDATE public.time_entries SET end_time = '13:00' WHERE id = $1`, [E_OLD], 'jusqu', 'Lucas : modification d’un jour clos refusée');
await refused(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [E_OLD], 'jusqu', 'Lucas : envoi d’un brouillon clos refusé');
await refused(`DELETE FROM public.time_entries WHERE id = $1`, [E_OLD], 'jusqu', 'Lucas : effacement d’un jour clos refusé');
await refused(`UPDATE public.time_entries SET work_date = $2::date WHERE id = $1`, [E_TODAY, D], 'jusqu',
  'Lucas : déplacer une ligne d’aujourd’hui VERS un jour clos refusé');
await accepted(`UPDATE public.time_entries SET end_time = '12:30' WHERE id = $1`, [E_TODAY], 'Lucas : un jour APRÈS la clôture reste modifiable');
check((await one(`SELECT to_char(end_time, 'HH24:MI') AS e FROM public.time_entries WHERE id = $1`, [E_TODAY])).e === '12:30', '… et la modification est bien écrite');

// « J'ai corrigé sur place » (mark_reserve_fixed, drapeau bemexo.allow_reserve_fix) : permis.
await as(LUCAS);
await accepted(`SELECT public.mark_reserve_fixed($1, true, 'reprise faite')`, [E_OLD], '« J’ai corrigé sur place » reste possible sur un jour clos (mark_reserve_fixed)');
check(!!(await one(`SELECT reserve_fixed_at FROM public.time_entries WHERE id = $1`, [E_OLD])).reserve_fixed_at, '… la réserve est bien marquée corrigée');

// Chrono sur un jour clos : refusé (borne comprise — elle insère au nom du salarié).
await as(LUCAS);
await accepted(`DELETE FROM public.active_sessions WHERE user_id = $1`, [LUCAS], 'Lucas peut annuler son chrono d’aujourd’hui');
await refused(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, $4::date)`,
  [LUCAS, CO, WS, D], 'clôturé', 'Lucas : pas de pointage sur un jour clos (téléphone ou borne)');

// « J'ai fini » (lot 9) sur un chrono d'aujourd'hui, après la clôture d'hier : marche.
await accepted(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, $4::date)`,
  [LUCAS, CO, WS, today], 'Lucas peut pointer aujourd’hui (après la date de clôture)');
await db.exec(`RESET ROLE`);
await db.query(`UPDATE public.active_sessions SET started_at = now() - interval '5 minutes' WHERE user_id = $1`, [LUCAS]);
await as(LUCAS);
r = await run(`SELECT entry_id, cancelled FROM public.finish_active_session()`);
check(r.ok && r.rows[0]?.cancelled === false && !!r.rows[0]?.entry_id, `finish_active_session : la journée d’aujourd’hui se ferme normalement${r.ok ? '' : ` — « ${r.err} »`}`);

// ═══ Chef d'équipe : ne passe pas outre ════════════════════════════════════
await as(LEAD);
await refused(ins, [CO, LUCAS, WS, D], 'clôturé', 'chef d’équipe : pas d’heures pour Lucas sur un jour clos');
await refused(`UPDATE public.time_entries SET end_time = '11:30' WHERE id = $1`, [E_OLD], 'clôturé', 'chef d’équipe : pas de modification d’un jour clos de Lucas');

// ═══ Nina (pas clôturée) : rien ne change ═══════════════════════════════════
await as(NINA);
await accepted(ins, [CO, NINA, WS, D], 'Nina écrit toujours le même jour');

// ═══ Le bureau garde la main ════════════════════════════════════════════════
await as(ADMIN);
await accepted(`UPDATE public.time_entries SET end_time = '11:00' WHERE id = $1`, [E_OLD], 'le bureau corrige une ligne d’un jour clos');
await accepted(ins, [CO, LUCAS, WS, D], 'le bureau ajoute une ligne sur un jour clos');

// Nouvelle date : remplace l'ancienne (upsert), toujours dans le passé.
await accepted(UPSERT, [LUCAS, CO, DM1, ADMIN], 'reclôturer à une autre date (upsert)');
check((await one(`SELECT closed_until::text AS u FROM public.user_closures WHERE user_id = $1`, [LUCAS])).u === DM1, '… la nouvelle date remplace l’ancienne');
await as(LUCAS);
await accepted(ins, [CO, LUCAS, WS, D], 'hier n’est plus clos pour Lucas : il y ajoute une ligne');
await as(ADMIN);
await accepted(UPSERT, [LUCAS, CO, D, ADMIN], 'retour à la clôture jusqu’à hier');

// closed_by ne se change pas pour quelqu'un d'autre.
await as(ADMIN2);
await refused(`UPDATE public.user_closures SET closed_by = $2 WHERE user_id = $1`, [LUCAS, NINA], /closed_by|row-level security/,
  'closed_by ne peut pas devenir quelqu’un d’autre que celui qui agit');

// ═══ « Rouvrir » : rien n'est supprimé ══════════════════════════════════════
await as(ADMIN);
await refused(`DELETE FROM public.user_closures WHERE user_id = $1`, [LUCAS], 'permission denied', 'aucune suppression possible, même pour le bureau');
// Une AUTRE personne du bureau rouvre la clôture posée par Paul.
await as(ADMIN2);
r = await accepted(REOPEN, [CO, LUCAS], '« Rouvrir » par une autre personne du bureau (reopened_at)');
check(r.ok && r.rows.length === 1, '… une ligne rouverte');
const row = await one(`SELECT closed_until::text AS u, closed_by, reopened_at, reopened_by FROM public.user_closures WHERE user_id = $1`, [LUCAS]);
check(row && row.u === D && row.closed_by === ADMIN && !!row.reopened_at && row.reopened_by === ADMIN2,
  'la trace reste : date, qui a clôturé, quand et par qui c’est rouvert');
await as(ADMIN2);
r = await run(REOPEN, [CO, LUCAS]);
check(r.ok && r.rows.length === 0, 'rouvrir deux fois : rien à faire (déjà rouvert)');
await as(LUCAS);
await accepted(`UPDATE public.time_entries SET end_time = '12:00' WHERE id = $1`, [E_OLD], 'après « Rouvrir », Lucas modifie de nouveau');
await accepted(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, $4::date)`,
  [LUCAS, CO, WS, D], 'après « Rouvrir », un pointage sur ce jour redevient possible');
// Un pointage ouvert sur un jour ≤ date : la reclôture est refusée, puis acceptée une fois le chrono fermé.
await as(ADMIN);
await refused(UPSERT, [LUCAS, CO, D, ADMIN], 'pointage encore ouvert', 'reclôturer pendant un pointage ouvert : refusé');
await as(LUCAS);
await accepted(`DELETE FROM public.active_sessions WHERE user_id = $1`, [LUCAS], 'Lucas ferme (annule) ce pointage');
await as(ADMIN);
await accepted(UPSERT, [LUCAS, CO, D, ADMIN], 'reclôturer après une réouverture');
const row2 = await one(`SELECT reopened_at, reopened_by FROM public.user_closures WHERE user_id = $1`, [LUCAS]);
check(row2.reopened_at === null && row2.reopened_by === null, '… la clôture est de nouveau active (reopened_at vidé)');
await as(LUCAS);
await refused(`UPDATE public.time_entries SET end_time = '12:15' WHERE id = $1`, [E_OLD], 'jusqu', '… et Lucas est de nouveau bloqué');

// ═══ Cron / service_role (auth.uid() nul) : jamais bloqué ══════════════════
await asService();
await accepted(ins, [CO, LUCAS, WS, DM1], 'service_role : écrit sur un jour clos sans être bloqué');
await accepted(`DELETE FROM public.time_entries WHERE user_id = $1 AND work_date = $2::date AND start_time = '13:00'`, [LUCAS, DM1], 'service_role : efface aussi');
await as(null);
await accepted(`UPDATE public.time_entries SET observation = 'cron' WHERE id = $1`, [E_OLD], 'cron (propriétaire, auth.uid() nul) : jamais bloqué');

// ═══ La clôture du MOIS fonctionne toujours, inchangée ═════════════════════
await as(ADMIN);
await accepted(`INSERT INTO public.month_closures (company_id, month, closed_by) VALUES ($1, date_trunc('month', $2::date)::date, $3)`,
  [CO, '2026-01-15', ADMIN], 'clôture du mois (janvier) : toujours possible');
await as(NINA);
await refused(ins, [CO, NINA, WS, '2026-01-20'], 'le mois est clôturé', 'clôture du mois : Nina refusée en janvier, même message qu’avant');

// ═══ Additif : rien d'existant n'a bougé ════════════════════════════════════
await db.exec(`RESET ROLE`);
check(await fnPrint() === before.fn, `fonctions existantes identiques octet pour octet (${EXISTING_FN.length})`);
check(await polPrint() === before.pol, 'policies existantes identiques (time_entries, active_sessions, month_closures)');
check(await trgPrint() === before.trg, 'triggers existants identiques (guard_write, guard_delete, active_sessions_guard, month_closures_guard)');
const pols = (await db.query(`SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_closures' ORDER BY policyname`)).rows;
check(pols.length === 4 && !pols.some((p) => p.cmd === 'DELETE' || p.cmd === 'ALL'),
  `4 policies sur la table neuve, aucune DELETE (${pols.map((p) => `${p.policyname}:${p.cmd}`).join(', ')})`);
const priv = (await db.query(`SELECT has_table_privilege('authenticated', 'public.user_closures', 'DELETE') AS del,
  has_table_privilege('anon', 'public.user_closures', 'SELECT') AS anon,
  has_function_privilege('authenticated', 'public.user_closed_until(uuid)', 'EXECUTE') AS fn`)).rows[0];
check(!priv.del && !priv.anon && !priv.fn, 'droits : pas de DELETE (authenticated), rien pour anon, lecture interne fermée');
const defs = (await db.query(`SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN
  ('user_closed_until', 'guard_time_entry_user_closure', 'guard_active_session_user_closure', 'guard_user_closure')`)).rows;
check(defs.length === 4 && defs.every((x) => x.prosecdef && JSON.stringify(x.proconfig).includes('search_path=')),
  'les 4 fonctions neuves : SECURITY DEFINER, search_path verrouillé');
// Lecture du texte : uniquement des créations neuves (aucun DROP TABLE/COLUMN, aucun ALTER d'une autre table).
const stmts = SQL.replace(/--.*$/gm, '').replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/\$do\$[\s\S]*?\$do\$/g, 'DO_BLOCK')
  .replace(/\$\$[\s\S]*?\$\$/g, '').replace(/'(?:[^']|'')*'/g, "'…'").split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const NEW_FN = '(user_closed_until|guard_time_entry_user_closure|guard_active_session_user_closure|guard_user_closure)';
const allowed = [
  /^CREATE TABLE IF NOT EXISTS public\.user_closures /,
  /^CREATE INDEX IF NOT EXISTS user_closures_company_idx ON public\.user_closures /,
  /^COMMENT ON TABLE public\.user_closures /,
  /^ALTER TABLE public\.user_closures ENABLE ROW LEVEL SECURITY$/,
  /^(REVOKE|GRANT) [A-Z, ]+ ON public\.user_closures (FROM|TO) [a-z_, ]+$/,
  /^DROP POLICY IF EXISTS user_closures_\w+ ON public\.user_closures$/,
  /^CREATE POLICY user_closures_\w+ ON public\.user_closures /,
  /^DO DO_BLOCK$/,
  new RegExp(`^CREATE OR REPLACE FUNCTION public\\.${NEW_FN}\\(`),
  new RegExp(`^REVOKE EXECUTE ON FUNCTION public\\.${NEW_FN}\\(`),
  /^DROP TRIGGER IF EXISTS (time_entries_guard_user_closure ON public\.time_entries|active_sessions_guard_user_closure ON public\.active_sessions|user_closures_guard ON public\.user_closures)$/,
  /^CREATE TRIGGER (time_entries_guard_user_closure|active_sessions_guard_user_closure|user_closures_guard) /,
];
const odd = stmts.filter((x) => !allowed.some((re) => re.test(x)));
check(odd.length === 0, `additive : ${stmts.length} instructions, toutes sur la table / les fonctions / les triggers NEUFS${odd.length ? ` — hors liste : ${odd.map((x) => x.slice(0, 80)).join(' | ')}` : ''}`);
check(!/DROP\s+(TABLE|COLUMN|FUNCTION)|ALTER\s+TABLE\s+public\.(?!user_closures)|DELETE\s+FROM|TRUNCATE|RENAME/i.test(SQL.replace(/--.*$/gm, '')),
  'aucun DROP TABLE/COLUMN/FUNCTION, aucun ALTER d’une autre table, aucun DELETE/TRUNCATE/RENAME');

// Rejouable : la migration passe une seconde fois sans erreur (IF NOT EXISTS / OR REPLACE).
r = await db.exec(SQL).then(() => ({ ok: true }), (e) => ({ ok: false, err: e.message }));
check(r.ok, `migration rejouable sans erreur${r.ok ? '' : ` — « ${r.err} »`}`);

await db.close();
console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
