// Lot 7 sécurité (oct. 2026) — une entreprise ne peut plus capter le salarié
// d'une autre. Rejoué POUR DE VRAI sur un Postgres jetable (PGlite). Jamais sur
// une vraie base : auth.users est ici une table de test.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:invitation-entreprise
//
// 1) AVANT : les fonctions de PRODUCTION (pg_get_functiondef du 10/10/2026,
//    recopiées mot pour mot, md5 identiques), avec la policy et les droits de
//    production. On prouve que l'attaque marche (« FAILLE PROUVÉE »).
// 2) Les contrôles « avant d'appliquer » du fichier : 0 sur une base saine, et
//    ils repèrent les traces de l'attaque.
// 3) La migration est chargée TELLE QUELLE, deux fois : triggers, policies
//    existantes, colonnes, signatures inchangés ; la vérification « après
//    application » du fichier rend true partout (md5 compris).
// 4) APRÈS : toutes les variantes de l'attaque échouent (« corrigé ») et les
//    parcours normaux marchent. Les créations de compte et premières connexions
//    passent par un rôle comme celui de GoTrue (supabase_auth_admin : ni
//    superutilisateur, ni BYPASSRLS, ni EXECUTE sur les fonctions de trigger) ;
//    invite-worker écrit en service_role ; le bureau passe par la RLS.
// 5) SANS BLOC 4, sur une seconde base : pourquoi les policies restrictives
//    sont obligatoires.
// 6) RETOUR ARRIÈRE : le bloc commenté du fichier, décommenté et exécuté, remet
//    les md5 de production ; puis la migration se rejoue.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const SQL = process.env.LOT7_MIG ? fs.readFileSync(process.env.LOT7_MIG, 'utf8') : mig('20261010150000_lot7_securite_invitation_par_entreprise.sql');
const DATES = mig('20261008210000_invitations_date_envoi.sql');
const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';
let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}

const A = 'c0000000-0000-0000-0000-00000000000a';
const B = 'c0000000-0000-0000-0000-00000000000b';
const ADMIN_A = 'a0000000-0000-0000-0000-00000000000a';
const ADMIN_B = 'a0000000-0000-0000-0000-00000000000b';
const NAME = { [A]: 'Entreprise A', [B]: 'Entreprise B' };
// md5(pg_get_functiondef(...)) en PRODUCTION le 10/10/2026 (identiques ici).
const PROD_MD5 = {
  handle_new_user: 'e128b35072c8d5664366ca336ecffcb9',
  handle_first_sign_in: 'f4d9fec94480b923e927ecfde4b70002',
  pending_invitations_sent_at: '2c6b51743ac9f39ffc04328e0a8ba391',
};

const STUB = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
-- GoTrue en production : ni superutilisateur, ni BYPASSRLS, aucun EXECUTE sur
-- les fonctions de trigger (les triggers jouent quand même).
CREATE ROLE supabase_auth_admin NOLOGIN NOBYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- auth.users : seulement les colonnes que lisent les fonctions.
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb,
  raw_app_meta_data jsonb, invited_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX users_email_partial_key ON auth.users (email);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO supabase_auth_admin;

-- public : colonnes et contraintes de PRODUCTION utiles ici.
CREATE TYPE public.battime_role AS ENUM ('admin', 'worker', 'lead');
CREATE TABLE public.companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  trial_ends_at timestamptz DEFAULT (now() + '30 days'::interval));
CREATE TABLE public.worksites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
  client_name text NOT NULL, city text NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.users (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id), first_name text NOT NULL, last_name text NOT NULL,
  role public.battime_role NOT NULL DEFAULT 'worker', phone text, is_active boolean DEFAULT true, email text);
CREATE TABLE public.invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
  email text, phone text, first_name text NOT NULL, last_name text NOT NULL, role public.battime_role NOT NULL DEFAULT 'worker',
  token text NOT NULL UNIQUE DEFAULT md5(random()::text || clock_timestamp()::text),  -- prod : encode(gen_random_bytes(32), 'hex')
  created_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT (now() + '30 days'::interval),
  accepted_at timestamptz, created_by uuid REFERENCES public.users(id));
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
-- Droits de PRODUCTION (tout pour anon / authenticated ; la RLS filtre).
GRANT ALL ON public.invitations, public.users, public.companies TO anon, authenticated, service_role;
-- Policy de PRODUCTION, mot pour mot (pg_policies, 10/10/2026).
CREATE POLICY invitations_admin_manage ON public.invitations FOR ALL TO authenticated
  USING ((company_id = ( SELECT u.company_id FROM users u WHERE (u.id = ( SELECT auth.uid() AS uid)))) AND (( SELECT u.role FROM users u WHERE (u.id = ( SELECT auth.uid() AS uid))) = 'admin'::battime_role))
  WITH CHECK ((company_id = ( SELECT u.company_id FROM users u WHERE (u.id = ( SELECT auth.uid() AS uid)))) AND (( SELECT u.role FROM users u WHERE (u.id = ( SELECT auth.uid() AS uid))) = 'admin'::battime_role));
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_read_all_stub ON public.users FOR SELECT TO authenticated USING (true); -- bouchon : la policy d'invitations lit users

-- ── Fonctions de PRODUCTION (pg_get_functiondef, 10/10/2026, md5 e128b350… / f4d9fec9…) ──
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
  v_inv public.invitations%ROWTYPE;
BEGIN
  v_first_name := nullif(new.raw_user_meta_data ->> 'first_name', '');
  v_last_name  := nullif(new.raw_user_meta_data ->> 'last_name', '');
  v_company_name := nullif(new.raw_user_meta_data ->> 'company_name', '');

  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.companies (name, trial_ends_at)
    VALUES (v_company_name, now() + interval '30 days')
    RETURNING id INTO v_company_id;
    v_role := 'admin'::public.battime_role;
    INSERT INTO public.worksites (company_id, client_name, city, is_active)
    VALUES (v_company_id, 'Autre', '', true);
  ELSE
    SELECT i.* INTO v_inv
    FROM public.invitations i
    WHERE lower(i.email) = lower(new.email)
      AND i.accepted_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at > now())
    ORDER BY i.created_at DESC
    LIMIT 1;
    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: aucune invitation en attente pour % (et pas de nom d''entreprise)', new.email;
    END IF;
    v_company_id := v_inv.company_id;
    v_role := 'worker'::public.battime_role;
    v_first_name := COALESCE(v_first_name, v_inv.first_name);
    v_last_name  := COALESCE(v_last_name, v_inv.last_name);
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
CREATE OR REPLACE FUNCTION public.handle_first_sign_in()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF old.last_sign_in_at IS NULL AND new.last_sign_in_at IS NOT NULL THEN
    UPDATE public.invitations
    SET accepted_at = now()
    WHERE lower(email) = lower(new.email) AND accepted_at IS NULL;
  END IF;
  RETURN new;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_first_sign_in() FROM PUBLIC, anon, authenticated;
-- Triggers de PRODUCTION (pg_get_triggerdef).
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER on_auth_user_first_sign_in AFTER UPDATE OF last_sign_in_at ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_first_sign_in();

INSERT INTO public.companies (id, name) VALUES ('${A}', 'Entreprise A'), ('${B}', 'Entreprise B');
-- Les deux bureaux (posés directement : un administrateur n'a pas d'invitation).
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${ADMIN_A}', 'bureau-a@exemple.test', '{}'), ('${ADMIN_B}', 'bureau-b@exemple.test', '{}');
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
INSERT INTO public.users (id, company_id, first_name, last_name, role, email) VALUES
  ('${ADMIN_A}', '${A}', 'Bureau', 'A', 'admin', 'bureau-a@exemple.test'),
  ('${ADMIN_B}', '${B}', 'Bureau', 'B', 'admin', 'bureau-b@exemple.test');
`;

// ── Comptes rendus ───────────────────────────────────────────────────────────
// Chaque ligne : « ok — <étiquette> — <ce qui est prouvé> ». Les étiquettes
// servent aux captures (scripts/tests/captures-lot7.mjs).
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const faille = (c, m) => check(c, `FAILLE PROUVÉE — ${m}`);
const corrige = (c, m) => check(c, `corrigé — ${m}`);
const normal = (c, m) => check(c, `parcours normal — ${m}`);
const section = (t) => console.log(`\n═══ ${t} ═══`);
const info = (t) => console.log(`   ${t}`);

/** Une base neuve : bouchon + migration des dates d'envoi, telles qu'en production. */
async function freshDb() {
  const d = new PGlite();
  await d.exec(STUB);
  await d.exec(DATES);
  return d;
}
let db = await freshDb();

// ── Rôles ────────────────────────────────────────────────────────────────────
async function as(role, sub, fn) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub', '${sub ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
}
const asOffice = (admin, fn) => as('authenticated', admin, fn);   // le bureau, par l'API (RLS)
const asGoTrue = (fn) => as('supabase_auth_admin', null, fn);     // GoTrue (Auth)
const asService = (fn) => as('service_role', null, fn);           // invite-worker (service role)

// ── Gestes ───────────────────────────────────────────────────────────────────
/** Le bureau écrit une invitation directement par l'API (POST /rest/v1/invitations). */
const officePost = (admin, row) => asOffice(admin, () => db.query(
  `INSERT INTO public.invitations (company_id, email, first_name, last_name, created_at)
   VALUES ($1, $2, $3, $4, coalesce($5::timestamptz, now()))`,
  [row.company_id, row.email, row.first_name ?? 'Jean', row.last_name ?? 'Exemple', row.created_at ?? null]));
/** Une ligne écrite côté serveur (service role), ou déjà là avant la migration. */
const serverRow = (company, email, extra = {}) => asService(() => db.query(
  `INSERT INTO public.invitations (company_id, email, first_name, last_name, created_at, expires_at, accepted_at)
   VALUES ($1, $2, $3, $4, coalesce($5::timestamptz, now()), coalesce($6::timestamptz, now() + interval '30 days'), $7::timestamptz)`,
  [company, email, extra.first_name ?? 'Jean', extra.last_name ?? 'Exemple', extra.created_at ?? null, extra.expires_at ?? null, extra.accepted_at ?? null]));
/**
 * GoTrue : crée le compte (INSERT auth.users → trigger handle_new_user), ou ne
 * crée RIEN si l'adresse a déjà un compte (renvoi d'invitation, signUp d'une
 * adresse connue). Rend { id } | { existing } | { error }.
 */
async function gotrueCreate(email, meta) {
  return asGoTrue(async () => {
    const ex = await db.query(`SELECT id FROM auth.users WHERE lower(email) = lower($1)`, [email]);
    if (ex.rows.length) return { existing: ex.rows[0].id };
    try {
      const r = await db.query(`INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2::jsonb) RETURNING id`, [email, JSON.stringify(meta)]);
      return { id: r.rows[0].id };
    } catch (e) { return { error: String(e.message) }; }
  });
}
/** Inscription publique (clé anon) : les métadonnées sont libres. */
const signUp = (email, meta) => gotrueCreate(email, meta);
/** invite-worker, dans l'ordre du code (supabase/functions/invite-worker/index.ts). */
async function inviteWorker(company, admin, email, names = { first_name: 'Jean', last_name: 'Exemple' }, extraMeta = {}) {
  // 0) adresse déjà rattachée à une AUTRE entreprise : refus.
  const other = await asService(() => db.query(`SELECT 1 FROM public.users WHERE lower(email) = lower($1) AND company_id <> $2`, [email, company]));
  if (other.rows.length) return { error: 'Un compte existe déjà avec cette adresse.', step0: true };
  // 1) l'invitation de l'APPELANT d'abord.
  const inv = (await asService(() => db.query(
    `INSERT INTO public.invitations (company_id, email, first_name, last_name, role, created_by) VALUES ($1, $2, $3, $4, 'worker', $5) RETURNING id`,
    [company, email, names.first_name, names.last_name, admin]))).rows[0];
  // 2) inviteUserByEmail(email, { data: { first_name, last_name, company_id, role, phone, employer_name } }).
  const r = await gotrueCreate(email, { first_name: names.first_name, last_name: names.last_name, company_id: company, role: 'worker', phone: null, employer_name: NAME[company], ...extraMeta });
  if (r.error) { await asService(() => db.query(`DELETE FROM public.invitations WHERE id = $1`, [inv.id])); return r; }
  const id = r.id ?? r.existing;
  await asGoTrue(() => db.query(`UPDATE auth.users SET invited_at = now() WHERE id = $1`, [id]));
  // 3) une seule invitation en attente par adresse et par entreprise (les plus anciennes partent).
  await asService(() => db.query(
    `DELETE FROM public.invitations i WHERE i.company_id = $1 AND lower(i.email) = lower($2) AND i.accepted_at IS NULL
       AND ((i.created_at, i.id) < (SELECT created_at, id FROM public.invitations WHERE id = $3) OR i.created_at IS NULL)`,
    [company, email, inv.id]));
  return { id, existing: !!r.existing };
}
/** Annulation par invite-worker (compte jamais utilisé supprimé, puis ses invitations). */
async function revoke(company, email) {
  const t = (await db.query(`SELECT id FROM public.users WHERE company_id = $1 AND lower(email) = lower($2)`, [company, email])).rows[0];
  if (t) await asGoTrue(() => db.query(`DELETE FROM auth.users WHERE id = $1`, [t.id])); // deleteUser → cascade users
  await asService(() => db.query(`DELETE FROM public.invitations WHERE company_id = $1 AND lower(email) = lower($2)`, [company, email]));
}
const firstSignIn = (id) => asGoTrue(() => db.query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`, [id]));
const profile = async (email) => (await db.query(`SELECT u.company_id, u.role::text AS role, u.first_name, u.last_name FROM public.users u WHERE lower(u.email) = lower($1)`, [email])).rows[0];
const authCount = async (email) => Number((await db.query(`SELECT count(*) AS n FROM auth.users WHERE lower(email) = lower($1)`, [email])).rows[0].n);
const invs = async (company, email) => (await db.query(`SELECT id, accepted_at, first_name FROM public.invitations WHERE company_id = $1 AND lower(email) = lower($2) ORDER BY created_at`, [company, email])).rows;
const sentAtFor = (admin) => asOffice(admin, async () => (await db.query(`SELECT email, invited_at FROM public.pending_invitations_sent_at()`)).rows);
const who = (p) => (p ? (p.company_id === A ? 'A' : p.company_id === B ? 'B' : 'une autre entreprise') : 'aucun compte');

// ── Ce que le fichier de migration donne à Cowork ────────────────────────────
/** Les lignes SQL commentées du fichier, à partir de `start`, jusqu'à la première ligne terminée par « ; » (ou jusqu'à `end`). */
function commentedBlock(startRe, endRe = null) {
  const lines = SQL.split('\n');
  let i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return null;
  const out = [];
  for (i += 1; i < lines.length; i++) {
    const l = lines[i];
    if (endRe && endRe.test(l)) return out.join('\n');
    if (!endRe && out.length === 0 && !/^-- SELECT\b/.test(l)) continue;
    if (l === '--') out.push('');
    else if (l.startsWith('-- ')) out.push(l.slice(3));
    else return null; // ligne non commentée : le bloc est mal formé
    if (!endRe && /;\s*$/.test(l)) return out.join('\n');
  }
  return null;
}
const PRE_SQL = commentedBlock(/^-- AVANT D'APPLIQUER/);
const POST_SQL = commentedBlock(/^-- VÉRIFICATION APRÈS APPLICATION/);
const ROLLBACK_SQL = commentedBlock(/^-- ── DÉBUT DU RETOUR ARRIÈRE ──$/, /^-- ── FIN DU RETOUR ARRIÈRE ──$/);
const preCounts = async () => Object.values((await db.query(PRE_SQL)).rows[0]).map(Number);
const md5Now = async () => Object.fromEntries((await db.query(`SELECT proname, md5(pg_get_functiondef(oid)) AS m FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace AND proname IN ('handle_new_user', 'handle_first_sign_in', 'pending_invitations_sent_at')`)).rows.map((r) => [r.proname, r.m]));
async function postCheck() {
  const row = (await db.query(POST_SQL)).rows[0];
  const bad = Object.entries(row).filter(([, v]) => v !== true).map(([k]) => k);
  return { all: Object.keys(row).length === 7 && bad.length === 0, bad };
}
const trgPrint = async () => (await db.query(`SELECT string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)) || ':' || tgenabled::text, ',' ORDER BY tgname) AS s FROM pg_trigger WHERE NOT tgisinternal`)).rows[0].s;
const privPrint = async () => JSON.stringify((await db.query(`SELECT
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') AS a1,
  has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') AS a2,
  has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'EXECUTE') AS a3,
  has_function_privilege('anon', 'public.handle_first_sign_in()', 'EXECUTE') AS a4,
  has_function_privilege('authenticated', 'public.handle_first_sign_in()', 'EXECUTE') AS a5,
  has_function_privilege('anon', 'public.pending_invitations_sent_at()', 'EXECUTE') AS a6,
  has_function_privilege('authenticated', 'public.pending_invitations_sent_at()', 'EXECUTE') AS a7`)).rows[0]);
const PRIV_OK = JSON.stringify({ a1: false, a2: false, a3: false, a4: false, a5: false, a6: false, a7: true });

// ═══ 1) AVANT : la faille, sur les fonctions de production ══════════════════
section('AVANT — fonctions de PRODUCTION (lues le 10/10/2026, recopiées mot pour mot)');
{
  const m = await md5Now();
  check(m.handle_new_user === PROD_MD5.handle_new_user && m.handle_first_sign_in === PROD_MD5.handle_first_sign_in
    && m.pending_invitations_sent_at === PROD_MD5.pending_invitations_sent_at, 'bouchon = production : mêmes md5 (pg_get_functiondef) que les trois fonctions de production');

  // a) B pose par l'API une invitation datée du futur, puis A invite.
  const E = 'salarie@exemple.test';
  await officePost(ADMIN_B, { company_id: B, email: E, last_name: 'Capté', created_at: '2099-01-01T00:00:00Z' });
  const r = await inviteWorker(A, ADMIN_A, E);
  const p = await profile(E);
  faille(!r.error && p?.company_id === B && p.role === 'worker',
    `B pose par l'API une invitation datée de 2099 ; A invite ${E} (« Entreprise A vous invite ») → la personne arrive chez ${who(p)}, salariée`);
  const again = await inviteWorker(A, ADMIN_A, E);
  faille(again.step0 === true, 'A ne peut plus l’inviter : « Un compte existe déjà avec cette adresse. » (son compte est chez B)');

  // b) Course, sans date truquée : B écrit entre la ligne de A et la création du compte.
  const E2 = 'course.avant@exemple.test';
  await serverRow(A, E2, { first_name: 'Léa', last_name: 'Course' });   // invite-worker de A, étape 1
  await officePost(ADMIN_B, { company_id: B, email: E2, first_name: 'Léa', last_name: 'Course' });
  const r2 = await gotrueCreate(E2, { first_name: 'Léa', last_name: 'Course', company_id: A, role: 'worker' }); // étape 2 de A
  faille(!r2.error && (await profile(E2))?.company_id === B, `course sans date truquée : B écrit son invitation entre celle de A et la création du compte → chez ${who(await profile(E2))}`);

  // c) Inscription publique sans nom d'entreprise : l'invitation la plus récente, quelle que soit l'entreprise.
  const E3 = 'public.avant@exemple.test';
  await serverRow(A, E3, { created_at: '2026-10-01T08:00:00Z' });
  await officePost(ADMIN_B, { company_id: B, email: E3 });
  const r3 = await signUp(E3, { first_name: 'Max', last_name: 'Public' });
  faille(!r3.error && (await profile(E3))?.company_id === B, `inscription publique (signUp) sans nom d’entreprise ni company_id → rattachée à l’invitation la plus récente, celle de ${who(await profile(E3))}`);

  // d) Patron qui s'inscrit (/inscription) avec une adresse invitée par A.
  const E4 = 'patron.avant@exemple.test';
  await serverRow(A, E4, { first_name: 'Paul', last_name: 'Patron' });
  const r4 = await signUp(E4, { company_name: 'Nouvelle SARL', first_name: 'Paul', last_name: 'Patron' });
  await firstSignIn(r4.id);
  faille((await invs(A, E4))[0]?.accepted_at != null, 'un patron d’une autre entreprise se connecte pour la première fois → l’invitation de A passe « acceptée »');

  // e) Deux entreprises invitent la même adresse : la première connexion « accepte » aussi celle de B.
  const E5 = 'double.avant@exemple.test';
  await serverRow(B, E5, { created_at: '2026-10-09T08:00:00Z' });          // B a invité la veille (compte pas encore créé)
  const r5 = await inviteWorker(A, ADMIN_A, E5);                             // A invite : compte chez A (sa ligne est la plus récente)
  await gotrueCreate(E5, { first_name: 'Jean', last_name: 'Exemple', company_id: B, role: 'worker' }); // l'envoi de B : compte existant, rien créé
  await firstSignIn(r5.id);
  faille((await profile(E5))?.company_id === A && (await invs(B, E5))[0]?.accepted_at != null,
    'A et B invitent la même adresse ; elle rejoint A, et sa première connexion marque AUSSI l’invitation de B « acceptée »');

  // f) Dates d'envoi : B lit la date d'envoi d'un compte qui appartient à A.
  const E6 = 'fuite.avant@exemple.test';
  const r6 = await inviteWorker(A, ADMIN_A, E6);
  await asGoTrue(() => db.query(`UPDATE auth.users SET invited_at = '2026-10-01T08:00:00Z' WHERE id = $1`, [r6.id]));
  await officePost(ADMIN_B, { company_id: B, email: E6 });
  faille((await sentAtFor(ADMIN_B)).some((x) => x.email === E6 && x.invited_at), 'B lit la date d’envoi (invited_at) d’un compte qui appartient à A');
}

// ═══ 2) Les contrôles « avant d'appliquer » du fichier ══════════════════════
section('CONTRÔLES AVANT APPLICATION (requête du fichier, lecture seule)');
const mainDb = db;
let cleanDb;
{
  check(!!PRE_SQL && /^SELECT\b/.test(PRE_SQL), 'la requête « AVANT D’APPLIQUER » se lit dans le fichier');
  // Base saine : un parcours normal complet (A invite, la personne se connecte), un patron inscrit.
  db = cleanDb = await freshDb();
  const r = await inviteWorker(A, ADMIN_A, 'saine@exemple.test');
  await firstSignIn(r.id);
  await inviteWorker(B, ADMIN_B, 'saine.b@exemple.test');
  await signUp('patron.sain@exemple.test', { company_name: 'SARL Saine', first_name: 'Paul', last_name: 'Sain' });
  const clean = await preCounts();
  check(clean.length === 6 && clean.every((n) => n === 0), `base saine (invitations, connexion, patron inscrit) : les 6 comptages valent 0 (${clean.join(', ')})`);
  db = mainDb;
  const hit = await preCounts();
  check(hit[0] > 0 && hit[1] > 0 && hit[3] > 0 && hit[4] > 0, `après l’attaque : ils la repèrent (n1 datée du futur ${hit[0]}, n2 plusieurs entreprises ${hit[1]}, n4 compte ailleurs ${hit[3]}, n5 invité par A profil chez B ${hit[4]})`);
}

// ═══ 3) La migration : rejouable, signatures et triggers inchangés ══════════
section('MIGRATION — chargée telle quelle, deux fois');
const polPrint = async () => (await db.query(`SELECT string_agg(tablename || '.' || policyname || ':' || permissive || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies WHERE policyname NOT LIKE 'invitations_server_only_%'`)).rows[0].s;
const colPrint = async () => (await db.query(`SELECT string_agg(table_schema || '.' || table_name || '.' || column_name || ':' || data_type, ',' ORDER BY table_schema, table_name, column_name) AS s FROM information_schema.columns WHERE table_schema IN ('public', 'auth')`)).rows[0].s;
const fnSig = async () => (await db.query(`SELECT string_agg(p.oid::regprocedure::text || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ';'), '') || ':' || pg_get_function_result(p.oid) || ':' || p.provolatile::text || ':' || p.proowner::regrole::text, ',' ORDER BY p.proname) AS s
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`)).rows[0].s;
const before = { trg: await trgPrint(), pol: await polPrint(), col: await colPrint(), sig: await fnSig(), priv: await privPrint() };
// Droits PAR DÉFAUT de la production : tout objet neuf ouvert à anon / authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
let loadErr = null;
try { await db.exec(SQL); await db.exec(SQL); } catch (e) { loadErr = e; }
check(!loadErr, `chargée deux fois sans erreur${loadErr ? ` : ${loadErr.message}` : ''}`);
const after = { trg: await trgPrint(), pol: await polPrint(), col: await colPrint(), sig: await fnSig(), priv: await privPrint() };
check(before.trg === after.trg, 'triggers inchangés (on_auth_user_created, on_auth_user_first_sign_in : même définition, toujours actifs)');
check(before.pol === after.pol, 'policies existantes inchangées (invitations_admin_manage mot pour mot)');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée');
check(before.sig === after.sig, 'mêmes fonctions, mêmes signatures, SECURITY DEFINER, search_path vide, propriétaire : aucune fonction ajoutée');
check(before.priv === PRIV_OK && after.priv === PRIV_OK, 'droits : fonctions de trigger inappelables (anon, authenticated, GoTrue), dates d’envoi pour authenticated seulement — malgré les droits par défaut');
const newPol = (await db.query(`SELECT string_agg(policyname || ':' || permissive || ':' || cmd || ':' || array_to_string(roles, '+') || ':' || coalesce(qual, '-') || ':' || coalesce(with_check, '-'), ',' ORDER BY policyname) AS s FROM pg_policies WHERE policyname LIKE 'invitations_server_only_%'`)).rows[0].s;
check(newPol === 'invitations_server_only_delete:RESTRICTIVE:DELETE:anon+authenticated:false:-,invitations_server_only_insert:RESTRICTIVE:INSERT:anon+authenticated:-:false,invitations_server_only_update:RESTRICTIVE:UPDATE:anon+authenticated:false:false',
  'bloc 4 : exactement 3 policies RESTRICTIVES d’écriture (INSERT, UPDATE, DELETE → false), rien sur la lecture');
{
  // Hors commentaires et hors corps de fonction : uniquement les 3 remplacements de fonction, les 3 policies et les droits.
  const body = SQL.replace(/--[^\n]*/g, '');
  const outside = body.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$…$function$');
  const replaced = [...outside.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([\w.]+)\(\)/gi)].map((x) => x[1]).sort().join(',');
  const pol = [...outside.matchAll(/(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)].map((x) => x[2]);
  check(replaced === 'public.handle_first_sign_in,public.handle_new_user,public.pending_invitations_sent_at'
    && pol.length === 6 && pol.every((n) => /^invitations_server_only_(insert|update|delete)$/.test(n))
    && !/\b(DROP\s+(TABLE|COLUMN|FUNCTION|TRIGGER|TYPE|INDEX|SCHEMA)|CREATE\s+(TABLE|TRIGGER|INDEX)|ALTER\s+(TABLE|POLICY|FUNCTION|TRIGGER)|TRUNCATE|INSERT\s+INTO|UPDATE\s+[\w.]+\s+SET|DELETE\s+FROM|RENAME)\b/i.test(outside),
    'seule exception à « ajout seulement » : 3 CREATE OR REPLACE FUNCTION ; sinon 3 policies neuves et les droits — aucun DROP, ALTER, trigger, ni écriture de données');
}
const post = await postCheck();
check(!!POST_SQL && post.all, `la requête « VÉRIFICATION APRÈS APPLICATION » du fichier rend true partout (md5 compris)${post.bad.length ? ` — faux : ${post.bad.join(', ')}` : ''}`);
const NEW_MD5 = await md5Now();
info(`md5 après application : handle_new_user ${NEW_MD5.handle_new_user} · handle_first_sign_in ${NEW_MD5.handle_first_sign_in} · pending_invitations_sent_at ${NEW_MD5.pending_invitations_sent_at}`);
{
  const r = (await db.query(`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'supabase_auth_admin'`)).rows[0];
  check(r && !r.rolbypassrls && !r.rolsuper, 'les créations de compte et premières connexions qui suivent passent par un rôle comme GoTrue (ni superutilisateur, ni BYPASSRLS, ni EXECUTE)');
}

// ═══ 4) APRÈS ═══════════════════════════════════════════════════════════════
section('APRÈS — migration du lot 7 sécurité appliquée');
// 4·0 Le bureau n'écrit plus d'invitation par l'API ; il lit toujours les siennes.
{
  let err = null;
  try { await officePost(ADMIN_B, { company_id: B, email: 'pose@exemple.test', created_at: '2099-01-01T00:00:00Z' }); } catch (e) { err = e; }
  corrige(err?.code === '42501' && (await invs(B, 'pose@exemple.test')).length === 0,
    `le bureau de B ne peut plus poser d’invitation par l’API, datée du futur ou non (refus ${err?.code ?? 'aucun'}) : seule invite-worker en écrit`);
  await serverRow(B, 'lu@exemple.test');
  const res = await asOffice(ADMIN_B, async () => ({
    upd: (await db.query(`UPDATE public.invitations SET accepted_at = now(), created_at = '2099-01-01' WHERE email = 'lu@exemple.test' RETURNING id`)).rows.length,
    del: (await db.query(`DELETE FROM public.invitations WHERE email = 'lu@exemple.test' RETURNING id`)).rows.length,
    mine: Number((await db.query(`SELECT count(*) AS n FROM public.invitations WHERE company_id = '${B}'`)).rows[0].n),
    theirs: Number((await db.query(`SELECT count(*) AS n FROM public.invitations WHERE company_id = '${A}'`)).rows[0].n),
  }));
  const row = (await invs(B, 'lu@exemple.test'))[0];
  corrige(res.upd === 0 && res.del === 0 && row && row.accepted_at == null, 'ni modifier (date, « acceptée ») ni supprimer une invitation par l’API');
  normal(res.mine > 0 && res.theirs === 0, 'le bureau lit toujours ses invitations, jamais celles d’une autre entreprise');
}
// 4·1 L'attaque : B a une invitation datée de 2099 (posée avant la migration), A invite.
{
  const E = 'salarie.apres@exemple.test';
  await serverRow(B, E, { last_name: 'Capté', created_at: '2099-01-01T00:00:00Z' });
  const r = await inviteWorker(A, ADMIN_A, E, { first_name: 'Jean', last_name: 'Exemple' });
  const p = await profile(E);
  corrige(!r.error && p?.company_id === A && p.role === 'worker' && p.last_name === 'Exemple',
    `B a une invitation datée de 2099 pour ${E} ; A l’invite → elle arrive chez ${who(p)}, salariée, avec les noms de A`);
  await firstSignIn(r.id);
  corrige((await invs(A, E)).every((x) => x.accepted_at != null) && (await invs(B, E)).every((x) => x.accepted_at == null),
    'sa première connexion accepte l’invitation de A ; celle de B reste en attente (elle n’a rien donné)');
  const byB = await inviteWorker(B, ADMIN_B, E);
  normal(byB.step0 === true && (await profile(E))?.company_id === A, 'B ne peut plus la reprendre ensuite (« Un compte existe déjà ») : elle reste chez A');
}
// 4·2 La course réaliste (deux lignes, B la plus récente) : c'est l'invitation ENVOYÉE qui décide.
{
  const E = 'course.apres@exemple.test';
  await serverRow(A, E, { first_name: 'Léa', last_name: 'Course' });
  await serverRow(B, E, { first_name: 'Léa', last_name: 'Course' });
  const r = await gotrueCreate(E, { first_name: 'Léa', last_name: 'Course', company_id: A, role: 'worker' });
  corrige(!r.error && (await profile(E))?.company_id === A, `course : B écrit après la ligne de A, l’envoi est celui de A → chez ${who(await profile(E))}`);
  const E2 = 'course2.apres@exemple.test';
  await serverRow(A, E2, { first_name: 'Léa', last_name: 'Course' });
  await serverRow(B, E2, { first_name: 'Léa', last_name: 'Course' });
  const r2 = await gotrueCreate(E2, { first_name: 'Léa', last_name: 'Course', company_id: B, role: 'worker' });
  normal(!r2.error && (await profile(E2))?.company_id === B, `même course, mais c’est B qui envoie → chez ${who(await profile(E2))} (déterministe : l’envoi décide)`);
}
// 4·3 Jamais de repli sur l'invitation d'une autre entreprise ; inscriptions publiques.
{
  const E = 'repli@exemple.test';
  await serverRow(B, E, { first_name: 'Max', last_name: 'Repli' });
  const r = await gotrueCreate(E, { first_name: 'Max', last_name: 'Repli', company_id: A, role: 'worker' });
  corrige(!!r.error && r.error.includes(A) && (await authCount(E)) === 0 && !(await profile(E)),
    'envoi au nom de A alors que seule B a une invitation → refusé, aucun compte (le message cite l’entreprise, pas l’adresse)');
  info(`message : ${r.error}`);
  const r2 = await signUp(E, { first_name: 'Max', last_name: 'Repli' });
  corrige(!!r2.error && /sans entreprise d'invitation/.test(r2.error) && (await authCount(E)) === 0 && (await invs(B, E))[0]?.accepted_at == null,
    'inscription publique (signUp) sans nom d’entreprise ni company_id → refusée, et l’invitation de B n’est pas consommée');
  // Fenêtre d'invite-worker : la ligne de A existe, le compte pas encore. B s'inscrit avec {company_id: B}.
  const E2 = 'fenetre@exemple.test';
  await serverRow(A, E2);
  const r3 = await signUp(E2, { first_name: 'Choisi', last_name: 'ParB', company_id: B });
  corrige(!!r3.error && (await authCount(E2)) === 0, 'inscription publique avec {company_id: B} pour une adresse que seule A a invitée → refusée');
  const r4 = await gotrueCreate(E2, { first_name: 'Jean', last_name: 'Exemple', company_id: A, role: 'worker' });
  normal(!r4.error && (await profile(E2))?.company_id === A, '… et l’envoi de A passe ensuite normalement → chez A');
}
// 4·4 Inscription d'un patron (/inscription) avec une adresse invitée par A.
{
  const E = 'patron.apres@exemple.test';
  await serverRow(A, E, { first_name: 'Paul', last_name: 'Patron' });
  const r = await signUp(E, { company_name: 'Nouvelle SARL', first_name: 'Paul', last_name: 'Patron', company_id: A });
  const p = await profile(E);
  const co = p && (await db.query(`SELECT c.name, (SELECT count(*) FROM public.worksites w WHERE w.company_id = c.id AND w.client_name = 'Autre') AS autre FROM public.companies c WHERE c.id = $1`, [p.company_id])).rows[0];
  normal(!r.error && p?.role === 'admin' && p.company_id !== A && p.company_id !== B && co?.name === 'Nouvelle SARL' && Number(co.autre) === 1,
    '/inscription : nouvelle entreprise, patron administrateur, chantier « Autre » (company_id des métadonnées ignoré)');
  await firstSignIn(r.id);
  corrige((await invs(A, E))[0]?.accepted_at == null, 'sa première connexion ne touche plus l’invitation de A');
}
// 4·5 Deux entreprises invitent la même adresse : chaque invitation ne rattache qu'à SON entreprise.
{
  const E = 'double.apres@exemple.test';
  await serverRow(B, E, { created_at: '2026-10-09T08:00:00Z' });
  const r = await inviteWorker(A, ADMIN_A, E);
  const second = await gotrueCreate(E, { first_name: 'Jean', last_name: 'Exemple', company_id: B, role: 'worker' }); // l'envoi de B arrive après
  await firstSignIn(r.id);
  corrige(!r.error && (await profile(E))?.company_id === A && !!second.existing && (await invs(A, E))[0]?.accepted_at != null && (await invs(B, E))[0]?.accepted_at == null,
    'A et B invitent la même adresse ; elle rejoint A, seule l’invitation de A passe acceptée, celle de B reste en attente');
  const E2 = 'double2.apres@exemple.test';
  await serverRow(A, E2, { created_at: '2026-10-09T08:00:00Z' });
  const r2 = await inviteWorker(B, ADMIN_B, E2);
  await firstSignIn(r2.id);
  normal(!r2.error && (await profile(E2))?.company_id === B && (await invs(A, E2))[0]?.accepted_at == null && (await invs(B, E2))[0]?.accepted_at != null,
    'dans l’autre sens (B envoie la première) : elle rejoint B, l’invitation de A reste en attente');
}
// 4·6 Dates d'envoi : B ne voit plus celle d'un compte de A ; A voit la sienne.
{
  const E = 'fuite.apres@exemple.test';
  const r = await inviteWorker(A, ADMIN_A, E);
  await asGoTrue(() => db.query(`UPDATE auth.users SET invited_at = '2026-10-01T08:00:00Z' WHERE id = $1`, [r.id]));
  await serverRow(B, E);
  corrige(!(await sentAtFor(ADMIN_B)).some((x) => x.email === E), 'B ne lit plus la date d’envoi (invited_at) d’un compte de A');
  normal((await sentAtFor(ADMIN_A)).some((x) => x.email === E && x.invited_at), 'A lit toujours la date d’envoi de son invitée (« Invitée le … »)');
}
// 4·7 Entrées : company_id illisible, majuscules, rôle, casse, joker, expirée, acceptée, renvoi.
{
  const E = 'entrees@exemple.test';
  await serverRow(B, E, { first_name: 'Max', last_name: 'Entrées' });
  const r = await gotrueCreate(E, { first_name: 'Max', last_name: 'Entrées', company_id: 'pas-un-uuid' });
  corrige(!!r.error && /sans entreprise d'invitation/.test(r.error), 'company_id illisible → refus propre (pas d’erreur de conversion)');
  const r2 = await gotrueCreate(E, { first_name: 'Max', last_name: 'Entrées', company_id: ` ${B.toUpperCase()} ` });
  normal(!r2.error && (await profile(E))?.company_id === B, 'company_id en majuscules / entouré d’espaces : reconnu');
  const r3 = await inviteWorker(A, ADMIN_A, 'role@exemple.test', { first_name: 'Rémi', last_name: 'Rôle' }, { role: 'admin' });
  corrige(!r3.error && (await profile('role@exemple.test'))?.role === 'worker', 'role « admin » dans les métadonnées : salarié quand même');
  await serverRow(A, 'Jean.Dupont@Exemple.test', { last_name: 'Dupont' });
  const r4 = await gotrueCreate('jean.dupont@exemple.test', { company_id: A });
  normal(!r4.error && (await profile('jean.dupont@exemple.test'))?.company_id === A, 'adresse : majuscules et minuscules confondues');
  await serverRow(A, 'l_dupont@exemple.test', { first_name: 'Luc', last_name: 'Dupont' });
  corrige(!!(await gotrueCreate('l.dupont@exemple.test', { company_id: A })).error, '« l_dupont » n’ouvre pas « l.dupont » (égalité exacte, pas LIKE)');
  await serverRow(A, 'expiree@exemple.test', { expires_at: new Date(Date.now() - 86400e3).toISOString() });
  corrige(!!(await gotrueCreate('expiree@exemple.test', { company_id: A })).error, 'invitation expirée → refus');
  await serverRow(A, 'acceptee@exemple.test', { accepted_at: new Date().toISOString() });
  corrige(!!(await gotrueCreate('acceptee@exemple.test', { company_id: A })).error, 'invitation déjà acceptée → refus');
  const E5 = 'renvoi@exemple.test';
  await serverRow(A, E5, { first_name: 'Ancien', created_at: new Date(Date.now() - 86400e3).toISOString() });
  await serverRow(A, E5, { first_name: 'Nouveau' });
  await serverRow(B, E5, { first_name: 'Pirate', created_at: '2099-01-01T00:00:00Z' });
  const r5 = await gotrueCreate(E5, { company_id: A });
  const p5 = await profile(E5);
  corrige(!r5.error && p5?.company_id === A && p5.first_name === 'Nouveau', 'renvoi en cours (deux lignes de A) et une ligne de B datée de 2099 : la plus récente de A (« Nouveau »), jamais « Pirate »');
}
// 4·8 Parcours normaux d'invitation : invitation, annulation, réinvitation.
{
  const E = 'reinvite@exemple.test';
  const r = await inviteWorker(A, ADMIN_A, E, { first_name: 'Inès', last_name: 'Normale' });
  const p = await profile(E);
  normal(!r.error && p?.company_id === A && p.role === 'worker' && p.first_name === 'Inès', 'A invite une salariée (invite-worker) → chez A, salariée, avec ses noms');
  await revoke(A, E);
  const r2 = await inviteWorker(A, ADMIN_A, E, { first_name: 'Inès', last_name: 'Normale' });
  normal(!r2.error && (await profile(E))?.company_id === A && (await invs(A, E)).length === 1, 'annulée puis réinvitée par A → chez A, une seule invitation');
  await revoke(A, E);
  const r3 = await inviteWorker(B, ADMIN_B, E, { first_name: 'Inès', last_name: 'Normale' });
  normal(!r3.error && (await profile(E))?.company_id === B && (await invs(A, E)).length === 0, 'annulée par A puis invitée par B → chez B');
  const r4 = await inviteWorker(B, ADMIN_B, E, { first_name: 'Inès', last_name: 'Normale' });
  normal(!r4.error && r4.existing && (await invs(B, E)).filter((x) => x.accepted_at == null).length === 1, 'renvoi par B (compte déjà créé) : rien n’est recréé, une seule invitation en attente');
}

// ═══ 5) SANS BLOC 4 : pourquoi les policies restrictives sont obligatoires ═══
section('SANS BLOC 4 — seconde base, migration chargée SANS les 3 policies restrictives');
{
  db = cleanDb;
  const without4 = SQL.replace(/-- ── 4\)[\s\S]*?(?=-- Droits : )/, '');
  check(without4 !== SQL && !/CREATE\s+POLICY/i.test(without4.replace(/--[^\n]*/g, '')), 'migration sans le bloc 4 (fonctions et droits identiques)');
  await db.exec(without4);
  const E = 'victime@exemple.test';
  await officePost(ADMIN_B, { company_id: B, email: E, first_name: 'Choisi', last_name: 'ParB' });
  const r = await signUp(E, { first_name: 'Choisi', last_name: 'ParB', company_id: B });
  const byA = await inviteWorker(A, ADMIN_A, E);
  faille(!r.error && (await profile(E))?.company_id === B && byA.step0 === true,
    'sans le bloc 4 : B pose une invitation par l’API puis inscrit l’adresse avec {company_id: B} → compte chez B, et A ne peut plus l’inviter');
  await db.exec(SQL);
  let err = null;
  try { await officePost(ADMIN_B, { company_id: B, email: 'victime2@exemple.test' }); } catch (e) { err = e; }
  const r2 = await signUp('victime2@exemple.test', { first_name: 'Choisi', last_name: 'ParB', company_id: B });
  corrige(err?.code === '42501' && !!r2.error && (await authCount('victime2@exemple.test')) === 0,
    'avec le bloc 4 (migration complète) : la pose par l’API est refusée (42501), l’inscription {company_id: B} aussi');
  db = mainDb;
}

// ═══ 6) RETOUR ARRIÈRE : le bloc du fichier, puis la migration rejouée ══════
section('RETOUR ARRIÈRE — le bloc commenté du fichier, exécuté');
{
  check(!!ROLLBACK_SQL && Object.values(PROD_MD5).every((m) => SQL.includes(m)), 'le bloc se lit dans le fichier, avec les md5 de production attendus');
  const trgBefore = await trgPrint();
  let err = null;
  try { await db.exec(ROLLBACK_SQL); } catch (e) { err = e; }
  const m = await md5Now();
  check(!err && m.handle_new_user === PROD_MD5.handle_new_user && m.handle_first_sign_in === PROD_MD5.handle_first_sign_in
    && m.pending_invitations_sent_at === PROD_MD5.pending_invitations_sent_at, `retour arrière : les trois md5 redeviennent ceux de la production${err ? ` (${err.message})` : ''}`);
  const nPol = Number((await db.query(`SELECT count(*) AS n FROM pg_policies WHERE policyname LIKE 'invitations_server_only_%'`)).rows[0].n);
  check(nPol === 0 && (await trgPrint()) === trgBefore && (await privPrint()) === PRIV_OK, 'les 3 policies sont retirées ; triggers et droits inchangés');
  // C'est bien l'ancien code : le bureau écrit à nouveau par l'API, et la capture revient.
  const E = 'retour@exemple.test';
  await officePost(ADMIN_B, { company_id: B, email: E, created_at: '2099-01-01T00:00:00Z' });
  await inviteWorker(A, ADMIN_A, E);
  check((await profile(E))?.company_id === B, 'le comportement de production revient (la faille aussi : c’est bien l’ancien code)');
  await db.exec(SQL);
  const m2 = await md5Now();
  check(m2.handle_new_user === NEW_MD5.handle_new_user && (await postCheck()).all, 'la migration se rejoue après le retour arrière (vérification « après application » à nouveau true)');
}

section('md5 (pg_get_functiondef) pour Cowork');
info(`après application   handle_new_user              ${NEW_MD5.handle_new_user}`);
info(`                    handle_first_sign_in         ${NEW_MD5.handle_first_sign_in}`);
info(`                    pending_invitations_sent_at  ${NEW_MD5.pending_invitations_sent_at}`);
info(`production / après retour arrière : ${PROD_MD5.handle_new_user} · ${PROD_MD5.handle_first_sign_in} · ${PROD_MD5.pending_invitations_sent_at}`);

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
