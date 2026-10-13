// Chantier terminé + bilan (lot 23, oct. 2026) : la migration rejouée POUR DE VRAI sur un Postgres
// jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:chantier-termine-db        (Node 22.18+ : il lit le TypeScript tel quel)
//
// Le schéma est un BOUCHON (tables réduites aux colonnes utiles) mais :
//   · get_my_company_id et is_admin sont recopiées de la PRODUCTION mot pour mot ;
//   · les trois règles de lignes de `worksites` sont celles de PRODUCTION (lecture de l'entreprise,
//     insertion salarié, écriture bureau) + la lecture support du lot 5 ;
//   · set_worksite_client_email (étape 2) et le déclencheur de budget sont relus dans leurs fichiers ;
//   · le coût de main-d'œuvre (my_worksite_labour, étape 13) et les dépenses sont appliqués TELS QUELS ;
//   · la migration du lot 23, elle, est chargée telle quelle depuis supabase/migrations.
// Tout est rejoué DEUX fois : colonne completed_at ABSENTE (le dépôt ne la crée nulle part) puis déjà PRÉSENTE
// en timestamptz (ce que l'audit du 13/10/2026 a lu en production).
// Les chiffres du bilan sont calculés par le VRAI code de l'application
// (supabase/functions/_shared/chantier-termine.ts) sur ce que la base rend, puis comparés à des sommes
// SQL indépendantes et à la règle du registre des réserves.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, '..', 'migrations');
const mig = (f) => fs.readFileSync(path.join(migDir, f), 'utf8');
const md5js = (t) => crypto.createHash('md5').update(t).digest('hex');
const MIG_FILE = fs.readdirSync(migDir).find((f) => f.endsWith('_lot23_chantier_termine.sql'));
const SQL = mig(MIG_FILE);
const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';
let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}
// Le VRAI code du bilan (règles pures partagées avec l'application).
const core = await import(pathToFileURL(path.join(here, '..', 'functions', '_shared', 'chantier-termine.ts')).href);

const CO = 'c0000000-0000-0000-0000-000000000001';
const CO2 = 'c0000000-0000-0000-0000-000000000002';
const ADMIN = 'a0000000-0000-0000-0000-00000000000a';
const ADMIN_OFF = 'a0000000-0000-0000-0000-00000000000d'; // bureau désactivé
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b'; // bureau d'une AUTRE entreprise
const SUPPORT = 'a0000000-0000-0000-0000-00000000000e'; // compte support : bureau de SA propre entreprise (CO2), en visite chez CO
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const LEA = '40000000-0000-0000-0000-000000000004';
const WS = 'e0000000-0000-0000-0000-000000000001'; // le chantier du jeu de données
const WS_B = 'e0000000-0000-0000-0000-000000000003'; // un autre chantier de CO
const WS2 = 'e0000000-0000-0000-0000-000000000002'; // chantier de l'autre entreprise

const sliceBetween = (src, start, end) => { const i = src.indexOf(start); return src.slice(i, src.indexOf(end, i)); };
const ETAPE2 = mig('20260918120000_etape2_securite.sql');
const CLIENT_EMAIL_FN = sliceBetween(ETAPE2, 'CREATE OR REPLACE FUNCTION public.set_worksite_client_email', '$function$;') + '$function$;';
const BUDGET = mig('20260726220000_budget_alerts.sql');
const BUDGET_SQL = sliceBetween(BUDGET, 'ALTER TABLE public.worksites\n  ADD COLUMN IF NOT EXISTS budget_hours', '-- Interrupteur par entreprise');
const COUT = mig('20260920210000_etape13_cout_chantier.sql');

const BASE = (variant) => `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- Droits PAR DÉFAUT de la production : tout pour anon et authenticated sur les objets neufs (avant les tables, pour qu'ils s'appliquent).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

CREATE TABLE public.companies (id uuid PRIMARY KEY, name text, travel_paid boolean NOT NULL DEFAULT false);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), role text,
  is_active boolean DEFAULT true, first_name text, last_name text);
CREATE TABLE public.user_payroll (user_id uuid PRIMARY KEY, company_id uuid, hourly_rate numeric);
CREATE TABLE public.worksites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, client_name text NOT NULL DEFAULT 'Client', city text NOT NULL DEFAULT '',
  client_email text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now()${variant === 'presente' ? ', completed_at timestamptz' : ''});
CREATE TABLE public.planning (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, worksite_id uuid, work_date date, absence_type text);
CREATE TABLE public.active_sessions (user_id uuid PRIMARY KEY, company_id uuid NOT NULL, worksite_id uuid, planning_id uuid, work_date date NOT NULL, started_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, user_id uuid NOT NULL, worksite_id uuid, planning_id uuid,
  work_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL, break_minutes integer NOT NULL DEFAULT 0, status text NOT NULL,
  observation text, reception text, gap_before text,
  reserve_resolved_at timestamptz, reserve_resolved_by uuid, reserve_resolution text,
  reserve_fixed_at timestamptz, reserve_fixed_by uuid, reserve_fix_note text,
  total_minutes integer GENERATED ALWAYS AS (
    (CASE WHEN end_time >= start_time THEN (extract(epoch FROM end_time - start_time) / 60)::int
          ELSE (extract(epoch FROM end_time - start_time) / 60)::int + 1440 END) - break_minutes) STORED);
CREATE TABLE public.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, worksite_id uuid, category text, label text);

-- ── Définitions de PRODUCTION (get_my_company_id, is_admin : mot pour mot) ──
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$ SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() AND u.is_active IS DISTINCT FROM false LIMIT 1 $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
-- Compte support (lot 5) pilotable.
CREATE FUNCTION public.support_company_ids() RETURNS uuid[] LANGUAGE sql STABLE
  AS $$ SELECT CASE WHEN nullif(current_setting('test.support_cos', true), '') IS NULL THEN ARRAY[]::uuid[]
                    ELSE string_to_array(current_setting('test.support_cos', true), ',')::uuid[] END $$;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin(), public.support_company_ids() TO authenticated;

-- Le budget (migration d'origine) et l'e-mail client (étape 2), relus dans leurs fichiers.
${BUDGET_SQL}
${CLIENT_EMAIL_FN}
REVOKE EXECUTE ON FUNCTION public.set_worksite_client_email(uuid, text) FROM PUBLIC, anon;

-- Les règles de lignes de PRODUCTION sur worksites (audit du 13/10/2026) + la lecture support du lot 5.
ALTER TABLE public.worksites ENABLE ROW LEVEL SECURITY;
CREATE POLICY worksites_admin_write ON public.worksites FOR ALL TO authenticated
  USING ((company_id = (SELECT u.company_id FROM users u WHERE u.id = (SELECT auth.uid()))) AND ((SELECT u.role FROM users u WHERE u.id = (SELECT auth.uid())) = 'admin'))
  WITH CHECK ((company_id = (SELECT u.company_id FROM users u WHERE u.id = (SELECT auth.uid()))) AND ((SELECT u.role FROM users u WHERE u.id = (SELECT auth.uid())) = 'admin'));
CREATE POLICY worksites_select_company ON public.worksites FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY worksites_worker_insert_own_company ON public.worksites FOR INSERT TO authenticated WITH CHECK (company_id = get_my_company_id());
CREATE POLICY support_read ON public.worksites FOR SELECT TO authenticated USING (company_id = ANY ((SELECT public.support_company_ids())::uuid[]));
`;

const SEED = `
INSERT INTO public.companies (id, name, travel_paid) VALUES ('${CO}', 'Dupont Rénovation', true), ('${CO2}', 'Autre SARL', false);
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Paul', 'Martin'), ('${ADMIN_OFF}', '${CO}', 'admin', false, 'Ancien', 'Bureau'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'), ('${SUPPORT}', '${CO2}', 'admin', true, 'Support', 'Bemexo'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Équipe'), ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Girard'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Roux'), ('${LEA}', '${CO}', 'worker', true, 'Léa', 'Petit');
INSERT INTO public.user_payroll VALUES ('${SAM}', '${CO}', 40), ('${LEA}', '${CO}', 30);   -- Alex n'a pas de taux horaire
INSERT INTO public.worksites (id, company_id, client_name, city, budget_hours, budget_amount) VALUES
  ('${WS}', '${CO}', 'Villa Dupont', 'Lyon', 40, 1600), ('${WS_B}', '${CO}', 'Atelier Petit', 'Nantes', null, null), ('${WS2}', '${CO2}', 'Chantier voisin', 'Lille', null, null);
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);

/** Les lignes SQL commentées du fichier entre deux repères. */
function commentedBlock(startRe, endRe) {
  const lines = SQL.split('\n');
  let i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return null;
  const out = [];
  for (i += 1; i < lines.length; i++) {
    const l = lines[i];
    if (endRe.test(l)) return out.join('\n');
    if (l === '--') out.push('');
    else if (l.startsWith('-- ')) out.push(l.slice(3));
    else return null;
  }
  return null;
}
const POST_SQL = commentedBlock(/^-- ── DÉBUT DE LA VÉRIFICATION ──$/, /^-- ── FIN DE LA VÉRIFICATION ──$/);
const ROLLBACK_SQL = commentedBlock(/^-- ── DÉBUT DU RETOUR ARRIÈRE ──$/, /^-- ── FIN DU RETOUR ARRIÈRE ──$/);
const NEW_FNS = ['worksite_completion_ready', 'set_worksite_completed', 'guard_worksite_completion'];
const NEW_TRIGGERS = ['worksites_guard_completion'];

// ═══ Le fichier lui-même : additif, en-tête, mots interdits ═════════════════
section(`Fichier ${MIG_FILE}`);
{
  const code = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const found = (re) => (code.match(re) || []).length;
  check(/^20261013180000_lot23_chantier_termine\.sql$/.test(MIG_FILE), 'nom du fichier : 20261013180000_lot23_chantier_termine.sql');
  check(found(/DROP|DELETE|TRUNCATE|CASCADE|ON DELETE/gi) === 0, 'grep DROP / DELETE / TRUNCATE / CASCADE / ON DELETE sur le fichier sans commentaires (corps de fonctions compris) : 0 résultat');
  // Lecture la plus stricte de la consigne : on retire aussi les « -- » de TOUTES les lignes (le retour arrière et la vérification deviennent du code).
  const decommented = SQL.split('\n').map((l) => l.replace(/^-- ?/, '')).join('\n');
  check((decommented.match(/DROP|DELETE|TRUNCATE|CASCADE|ON DELETE/gi) || []).length === 0, 'et AUCUN de ces mots non plus après retrait des « -- » de tout le fichier (retour arrière non destructif : REVOKE seulement)');
  check(found(/\bCREATE\s+POLICY\b/gi) === 0 && found(/\bALTER\s+POLICY\b/gi) === 0 && found(/\bENABLE\s+ROW\s+LEVEL/gi) === 0, 'aucune règle de lignes créée, modifiée ni activée : les règles de worksites ne sont pas touchées');
  const alters = (code.match(/\bALTER\s+\w+[^;]*/gi) || []).map((a) => a.trim().replace(/\s+/g, ' '));
  check(alters.length === 2 && alters.every((a) => /^ALTER TABLE public\.worksites ADD COLUMN IF NOT EXISTS completed_(at timestamptz|by uuid)$/.test(a)), `ALTER : seulement deux « ADD COLUMN IF NOT EXISTS » sur worksites (${alters.join(' ; ')})`);
  check(!/\bRENAME\b|\bREFERENCES\b|\bFOREIGN\s+KEY\b|(?<!\bIS\s+)\bNOT\s+NULL\b|\bDEFAULT\s+(?!NULL)/i.test(code.replace(/p_date date DEFAULT NULL/g, '')), 'aucune clé étrangère, aucun NOT NULL, aucune valeur par défaut, aucun RENAME');
  check(!/\bINSERT\s+INTO\b|\bUPDATE\s+public\.(?!worksites\b)/i.test(code), 'aucune insertion ; la seule mise à jour de données est celle de worksites dans la fonction du bureau');
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]).sort();
  check(JSON.stringify(fns) === JSON.stringify([...NEW_FNS].sort()), `fonctions créées : les 3 neuves, aucune existante remplacée (${fns.join(', ')})`);
  const trgs = [...code.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]);
  check(trgs.length === 1 && trgs[0] === NEW_TRIGGERS[0] && /IF NOT EXISTS \(SELECT 1 FROM pg_trigger WHERE tgname = 'worksites_guard_completion'/.test(code), 'un seul déclencheur, créé seulement s’il manque');
  const secdef = (name) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?SECURITY DEFINER\\s+SET search_path TO ''`).test(code);
  check(secdef('set_worksite_completed') && secdef('guard_worksite_completion'), 'les deux fonctions à effet sont SECURITY DEFINER avec search_path vide');
  check(/^-- RETOUR ARRIÈRE/m.test(SQL) && SQL.indexOf('-- RETOUR ARRIÈRE') < SQL.indexOf('-- VÉRIFICATION APRÈS APPLICATION') && SQL.indexOf('-- VÉRIFICATION APRÈS APPLICATION') < SQL.indexOf('-- HISTORIQUE') && SQL.indexOf('-- HISTORIQUE') < SQL.indexOf('\nALTER TABLE public.worksites'),
    'en-tête : RETOUR ARRIÈRE, VÉRIFICATION APRÈS APPLICATION, HISTORIQUE, avant le code');
  check(/INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\n--\s+VALUES \('20261013180000', 'lot23_chantier_termine'\) ON CONFLICT DO NOTHING;/.test(SQL), 'HISTORIQUE : version et nom d’enregistrement (nom du fichier sans .sql)');
  check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification (une requête) et le retour arrière (blocs commentés)');
  check(/NEUTRALISE, sans rien retirer/.test(SQL) && /GARDÉES/.test(SQL) && /existait peut-être/.test(SQL) && !/^-- (DROP|DELETE|ALTER)/m.test(ROLLBACK_SQL ? SQL.slice(SQL.indexOf('DÉBUT DU RETOUR'), SQL.indexOf('FIN DU RETOUR')) : ''),
    'le retour arrière neutralise sans rien retirer, garde les colonnes et dit pourquoi (completed_at existe peut-être déjà)');
  check(ROLLBACK_SQL.split('\n').filter(Boolean).every((l) => /^REVOKE ALL ON FUNCTION public\.\w+\(.*\) FROM PUBLIC, anon, authenticated;$/.test(l)) && ROLLBACK_SQL.split('\n').filter(Boolean).length === 2, 'le retour arrière : deux REVOKE, rien d’autre');
}

// ═══ Le jeu de données fictif ═══════════════════════════════════════════════
/** Données du bilan (FICTIVES) : trois salariés, route payée, brouillons, réserves ouvertes et levées, dépenses, documents. */
async function seedBilan(db) {
  await db.exec(`
INSERT INTO public.time_entries (id, company_id, user_id, worksite_id, work_date, start_time, end_time, break_minutes, status, reception, observation, gap_before, reserve_resolved_at, reserve_fixed_at) VALUES
  -- Sam : deux demi-journées le même jour, 1 h de route entre les deux (l'entreprise paie la route) → 480 + 60 = 540 payées
  ('b0000000-0000-0000-0000-000000000001', '${CO}', '${SAM}', '${WS}', '2026-09-14', '08:00', '12:00', 0, 'submitted', 'en_cours', null, null, null, null),
  ('b0000000-0000-0000-0000-000000000002', '${CO}', '${SAM}', '${WS}', '2026-09-14', '13:00', '17:00', 0, 'validated', 'avec', 'Joint à reprendre côté cuisine', 'route', null, null),
  -- Sam : réserve levée par le salarié ; un brouillon ; une intervention retirée
  ('b0000000-0000-0000-0000-000000000003', '${CO}', '${SAM}', '${WS}', '2026-09-15', '08:00', '12:30', 30, 'submitted', 'avec', 'Rayure sur la vitre', null, null, '2026-09-16 10:00+00'),
  ('b0000000-0000-0000-0000-000000000004', '${CO}', '${SAM}', '${WS}', '2026-10-05', '08:00', '11:00', 0, 'draft', null, null, null, null, null),
  ('b0000000-0000-0000-0000-000000000005', '${CO}', '${SAM}', '${WS}', '2026-10-06', '08:00', '16:00', 0, 'cancelled', 'avec', 'Retirée', null, null, null),
  -- Alex : sans taux horaire → coût incomplet ; réserve levée par le bureau
  ('b0000000-0000-0000-0000-000000000006', '${CO}', '${ALEX}', '${WS}', '2026-10-02', '08:00', '16:00', 60, 'submitted', 'avec', 'Plinthe fendue', null, '2026-10-03 09:00+00', null),
  -- Léa : uniquement un brouillon + un brouillon vide
  ('b0000000-0000-0000-0000-000000000007', '${CO}', '${LEA}', '${WS}', '2026-10-07', '09:00', '12:00', 0, 'draft', null, null, null, null, null),
  ('b0000000-0000-0000-0000-000000000008', '${CO}', '${LEA}', '${WS}', '2026-10-08', '09:00', '09:00', 0, 'draft', null, null, null, null, null),
  -- Un autre chantier : ne doit JAMAIS entrer dans le bilan de WS
  ('b0000000-0000-0000-0000-000000000009', '${CO}', '${SAM}', '${WS_B}', '2026-09-20', '08:00', '12:00', 0, 'submitted', 'avec', 'Autre chantier', null, null, null);
INSERT INTO public.documents (company_id, worksite_id, category, label) VALUES
  ('${CO}', '${WS}', 'devis', 'Devis'), ('${CO}', '${WS}', 'facture', 'F1'), ('${CO}', '${WS}', 'facture_payee', 'F2'), ('${CO}', '${WS}', 'photo', 'P1'), ('${CO}', '${WS}', 'photo', 'P2'),
  ('${CO}', '${WS}', 'reserve', 'R'), ('${CO}', '${WS}', null, 'Sans'), ('${CO}', '${WS_B}', 'plan', 'Autre chantier');
INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, absence_type) VALUES
  ('${CO}', '${SAM}', '${WS}', '2999-01-01', null), ('${CO}', '${ALEX}', '${WS}', '2999-01-02', null), ('${CO}', '${ALEX}', '${WS}', '2999-01-03', 'conge');
INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ('${LEA}', '${CO}', '${WS}', '2026-10-13');
`);
}

/** Tout le scénario, pour une des deux formes de la base. */
async function suite(variant) {
  const titre = variant === 'absente' ? 'colonne completed_at ABSENTE avant la migration' : 'colonne completed_at DÉJÀ PRÉSENTE (timestamptz), comme en production';
  const db = new PGlite();
  await db.exec(BASE(variant));
  await db.exec(COUT);   // my_worksite_labour, worksite_labour, worksite_expenses (étape 13, tels quels)
  await db.exec(SEED);
  await seedBilan(db);
  await db.exec(`
INSERT INTO public.worksite_expenses (company_id, worksite_id, spent_on, category, label, amount) VALUES
  ('${CO}', '${WS}', '2026-09-10', 'materiaux', 'Plaques', 820.50), ('${CO}', '${WS}', '2026-09-12', 'materiaux', 'Vis', 179.50),
  ('${CO}', '${WS}', '2026-09-20', 'location', 'Échafaudage', 150), ('${CO}', '${WS}', '2026-10-01', 'autre', 'Avoir', -50),
  ('${CO}', '${WS_B}', '2026-09-21', 'materiaux', 'Autre chantier', 999);
`);

  const as = async (uid, role = 'authenticated') => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); await db.exec(`SET ROLE ${role}`); };
  const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); };
  const support = async (cos) => { await db.query(`SELECT set_config('test.support_cos', $1, false)`, [cos]); };
  const errOf = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return { code: e.code || '', msg: e.message }; } };
  const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
  const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
  const one = async (sql, p = []) => (await rows(sql, p))[0];
  const count = async (sql, p = []) => Number((await one(sql, p)).n);
  const affected = async (sql, p = []) => (await db.query(sql, p)).affectedRows;
  const status = async (id = WS) => { await root(); return one('SELECT completed_at, completed_by FROM public.worksites WHERE id = $1', [id]); };
  const label = (m) => `[${variant}] ${m}`;
  const ck = (c, m) => check(c, label(m));
  const parisToday = core.todayParis();
  const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

  section(`Base d’avant le lot — ${titre}`);
  await root();
  {
    const r = await one(`SELECT (SELECT count(*) FROM pg_proc WHERE proname = ANY($1))::int AS f, (SELECT count(*) FROM pg_trigger WHERE tgname = ANY($2))::int AS t,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'worksites' AND column_name = 'completed_at')::int AS a,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'worksites' AND column_name = 'completed_by')::int AS b`, [NEW_FNS, NEW_TRIGGERS]);
    ck(r.f === 0 && r.t === 0 && r.b === 0 && r.a === (variant === 'absente' ? 0 : 1), `avant : aucune fonction du lot, aucun déclencheur, completed_by absente, completed_at ${variant === 'absente' ? 'absente' : 'présente'}`);
    const pol = await rows(`SELECT policyname FROM pg_policies WHERE tablename = 'worksites' ORDER BY 1`);
    ck(JSON.stringify(pol.map((p) => p.policyname)) === JSON.stringify(['support_read', 'worksites_admin_write', 'worksites_select_company', 'worksites_worker_insert_own_company']), 'avant : les quatre règles de production de worksites');
    // Aujourd'hui (avant la migration) : un salarié peut insérer, mais l'application ne propose rien (la colonne ou la fonction manque).
    await as(SAM);
    const e = await errOf(`SELECT public.worksite_completion_ready()`);
    ck(e && e.code === '42883', 'avant : la fonction « suis-je prête ? » n’existe pas (PGRST202 côté application : tout reste caché)');
    const w = await one(`SELECT * FROM public.worksites WHERE id = $1`, [WS]);
    ck(variant === 'absente' ? !('completed_at' in w) : w.completed_at === null, variant === 'absente' ? 'avant : la ligne lue n’a pas completed_at (hasCompletionColumn = faux : rien ne s’affiche)' : 'avant : completed_at vaut null, la fonction reste cachée faute de « prête »');
    ck((variant === 'absente' ? core.hasCompletionColumn(w) === false : true) && core.isWorksiteFinished(w) === false, 'avant : le code de l’application lit « colonne absente » ou « en cours » : aucun chantier n’est masqué');
    const ui = core.completionUi({ ready: false, hasColumn: core.hasCompletionColumn(w), supportMode: false });
    ck(ui.bilan === false && ui.write === false, 'avant : « prête » est faux → ni bouton Terminer, ni bilan, ni message (la fonction reste cachée)');
  }

  const polsBefore = await (async () => { await root(); return rows(`SELECT policyname, permissive, cmd, roles::text, md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) m FROM pg_policies ORDER BY schemaname, tablename, policyname`); })();
  const dataPrint = async () => { await root(); return JSON.stringify(await rows(`SELECT
    (SELECT json_agg(t ORDER BY id) FROM public.time_entries t) AS te, (SELECT json_agg(p ORDER BY id) FROM public.planning p) AS pl,
    (SELECT json_agg(d ORDER BY id) FROM public.documents d) AS d, (SELECT json_agg(e ORDER BY id) FROM public.worksite_expenses e) AS ex,
    (SELECT json_agg(u ORDER BY id) FROM public.users u) AS u, (SELECT json_agg(a ORDER BY user_id) FROM public.active_sessions a) AS a`)); };
  const otherFns = async () => { await root(); return (await one(`SELECT string_agg(p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.proname) AS s FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND NOT (p.proname = ANY($1))`, [NEW_FNS])).s; };
  const otherTriggers = async () => { await root(); return (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal AND NOT (tgname = ANY($1))`, [NEW_TRIGGERS])).s; };
  const worksiteRows = async () => { await root(); return JSON.stringify(await rows(`SELECT to_jsonb(w) - 'completed_at' - 'completed_by' AS r FROM public.worksites w ORDER BY id`)); };
  const labourOf = async (uid = ADMIN) => { await as(uid); return JSON.stringify(await rows(`SELECT worksite_id, user_id, worked_minutes::int AS w, route_minutes::int AS r, paid_minutes::int AS p, cost::float AS c, unpriced_minutes::int AS u FROM public.my_worksite_labour(NULL, NULL) ORDER BY 1, 2`)); };
  const fnsBefore = await otherFns(), trgBefore = await otherTriggers(), dataBefore = await dataPrint(), wsBefore = await worksiteRows(), labourBefore = await labourOf();

  section(`La migration — ${titre}`);
  await root();
  const e1 = await errExec(SQL);
  ck(!e1, `migration appliquée sans erreur ${e1 ?? ''}`);
  const cnt = async () => one(`SELECT (SELECT count(*) FROM pg_policies)::int AS p, (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)::int AS t, (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace)::int AS f,
    (SELECT count(*) FROM information_schema.columns WHERE table_name = 'worksites')::int AS c`);
  const c1 = await cnt();
  ck(!(await errExec(SQL)), 'migration chargée une seconde fois sans erreur (rejouable)');
  const c2 = await cnt();
  ck(JSON.stringify(c1) === JSON.stringify(c2), `rejouée : mêmes décomptes (règles ${c2.p}, déclencheurs ${c2.t}, fonctions ${c2.f}, colonnes ${c2.c})`);
  ck(await otherFns() === fnsBefore, 'fonctions existantes inchangées, texte pour texte (get_my_company_id, is_admin, my_worksite_labour, set_worksite_client_email…)');
  ck(await otherTriggers() === trgBefore, 'déclencheurs existants inchangés (worksites_reset_budget_alerts, worksite_expenses_guard…)');
  const polsAfter = await rows(`SELECT policyname, permissive, cmd, roles::text, md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) m FROM pg_policies ORDER BY schemaname, tablename, policyname`);
  ck(JSON.stringify(polsBefore) === JSON.stringify(polsAfter), 'AUCUNE règle de lignes ajoutée, modifiée ni retirée sur toute la base (worksites comprise), texte pour texte');
  ck(await dataPrint() === dataBefore, 'données inchangées : interventions, planning, documents, dépenses, utilisateurs, pointages en cours');
  ck(await worksiteRows() === wsBefore, 'les chantiers sont inchangés (hors les deux nouvelles colonnes)');
  ck(await labourOf() === labourBefore, 'my_worksite_labour rend exactement les mêmes lignes qu’avant');
  {
    const cols = await rows(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'worksites' AND column_name IN ('completed_at','completed_by') ORDER BY 1`);
    ck(JSON.stringify(cols) === JSON.stringify([{ column_name: 'completed_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null }, { column_name: 'completed_by', data_type: 'uuid', is_nullable: 'YES', column_default: null }]), 'colonnes : completed_at (timestamptz) et completed_by (uuid), nullables, sans valeur par défaut');
    ck(await count(`SELECT count(*) n FROM pg_constraint WHERE conrelid = 'public.worksites'::regclass AND contype = 'f'`) === 0, 'aucune clé étrangère sur worksites (rien ne bloque la suppression d’un compte)');
    ck(await count(`SELECT count(*) n FROM public.worksites WHERE completed_at IS NOT NULL OR completed_by IS NOT NULL`) === 0, 'aucun chantier n’est marqué terminé par la migration');
  }
  {
    // La vérification de l'en-tête, exécutée TELLE QUELLE : une ligne, 9 colonnes à true.
    const v = await one(POST_SQL.replace(/;\s*$/, ''));
    const vals = Object.values(v);
    ck(vals.length === 9 && vals.every((x) => x === true), `VÉRIFICATION de l’en-tête : ${vals.length} × true (${Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k).join(', ') || 'aucune fausse'})`);
  }
  await root();
  {
    const f = await rows(`SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth, p.prosecdef, array_to_string(p.proconfig, ',') AS cfg
      FROM pg_proc p WHERE p.proname = ANY($1) ORDER BY 1`, [NEW_FNS]);
    const by = Object.fromEntries(f.map((x) => [x.proname, x]));
    ck(by.worksite_completion_ready.auth && !by.worksite_completion_ready.anon && by.set_worksite_completed.auth && !by.set_worksite_completed.anon && !by.guard_worksite_completion.auth && !by.guard_worksite_completion.anon,
      'droits : « prête » et « terminer » aux connectés seulement (jamais aux anonymes) ; le garde n’est appelable par personne');
    ck(f.every((x) => x.cfg === 'search_path=""'), 'les 3 fonctions ont un search_path vide');
  }
  await as(SAM);
  ck((await one('SELECT public.worksite_completion_ready() AS r')).r === true, '« suis-je prête ? » répond true à un connecté');
  await as(null, 'anon');
  ck((await errOf('SELECT public.worksite_completion_ready()'))?.code === '42501', 'et refuse un anonyme');

  // ═══ Le bureau termine, rouvre ══════════════════════════════════════════
  section(`Le bureau termine et rouvre — ${titre}`);
  await as(ADMIN);
  {
    const r = await one(`SELECT public.set_worksite_completed($1, $2) AS at`, [WS, '2026-10-09']);
    const s = await status();
    ck(new Date(r.at).toISOString() === '2026-10-09T12:00:00.000Z' && new Date(s.completed_at).toISOString() === '2026-10-09T12:00:00.000Z' && s.completed_by === ADMIN, 'terminer au 9 octobre : écrit à midi UTC, avec le compte du bureau');
    ck(core.completedDay({ completed_at: new Date(s.completed_at).toISOString() }) === '2026-10-09' && core.termineLe({ completed_at: new Date(s.completed_at).toISOString() }) === 'Terminé le 9 octobre 2026', 'le code de l’application relit le même jour : « Terminé le 9 octobre 2026 »');
    await as(SAM);
    const seen = await one('SELECT completed_at FROM public.worksites WHERE id = $1', [WS]);
    ck(seen.completed_at != null && core.isWorksiteFinished(seen), 'un salarié LIT la date (c’est ce qui masque le chantier dans ses listes de choix)');
    ck(await worksiteRows() === wsBefore, 'terminer ne change que les deux colonnes du chantier');
    ck(await dataPrint() === dataBefore, 'terminer ne touche aucune intervention, aucun planning, aucun document, aucune dépense, aucun pointage en cours');
    ck(await labourOf() === labourBefore, 'les heures et le coût (my_worksite_labour) sont EXACTEMENT les mêmes après avoir terminé : l’historique reste exact');
    const wsOther = await one(`SELECT completed_at FROM public.worksites WHERE id = $1`, [WS_B]);
    ck(wsOther.completed_at === null, 'les autres chantiers ne bougent pas');
  }
  await as(ADMIN);
  {
    const today = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, parisToday]);
    const yest = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, addDays(parisToday, -1)]);
    ck(!today && !yest, `la date du jour (${parisToday}) et la veille sont acceptées`);
    const tomorrow = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, addDays(parisToday, 1)]);
    const far = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, '2999-01-01']);
    ck(tomorrow?.code === '22023' && /futur/.test(tomorrow.msg) && far?.code === '22023', 'une date dans le futur est refusée avec un message français (demain, 2999)');
    const s = await status();
    ck(new Date(s.completed_at).toISOString().slice(0, 10) === addDays(parisToday, -1), 'et le refus n’a rien écrit : la dernière date valide reste (modifiable)');
    await as(ADMIN);
    const old = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, '2026-01-15']);
    ck(!old, `une date ancienne est acceptée (le bureau peut régulariser) ${old ? old.code + ' ' + old.msg : ''}`);
  }
  await as(ADMIN);
  {
    const r = await one(`SELECT public.set_worksite_completed($1, NULL) AS at`, [WS]);
    const s = await status();
    ck(r.at === null && s.completed_at === null && s.completed_by === null, 'rouvrir : date et auteur retirés');
    ck(await worksiteRows() === wsBefore && await dataPrint() === dataBefore && await labourOf() === labourBefore, 'rouvrir ne change rien d’autre non plus');
    const r2 = await errOf(`SELECT public.set_worksite_completed($1, NULL)`, [WS]);
    ck(!r2, 'rouvrir un chantier déjà ouvert : sans effet, sans erreur');
  }

  // ═══ Abus ═══════════════════════════════════════════════════════════════
  section(`Abus — ${titre}`);
  await as(ADMIN); await db.query(`SELECT public.set_worksite_completed($1, $2)`, [WS_B, '2026-10-01']); await root();
  const stBefore = JSON.stringify(await status(WS_B));
  const same = async () => JSON.stringify(await status(WS_B)) === stBefore && (await status(WS)).completed_at === null;
  for (const [who, uid] of [['Sam (salarié)', SAM], ['le chef d’équipe', CHEF], ['un ancien bureau désactivé', ADMIN_OFF]]) {
    await as(uid);
    const e = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, '2026-10-09']);
    ck(e?.code === '42501' && /Réservé au bureau/.test(e.msg), `${who} : la fonction du bureau lui est refusée (42501, message français)`);
    const e2 = await errOf(`SELECT public.set_worksite_completed($1, NULL)`, [WS_B]);
    ck(e2?.code === '42501', `${who} : il ne peut pas non plus ROUVRIR un chantier terminé`);
    ck(await same(), `${who} : rien n’a bougé`);
  }
  await as(SAM);
  ck(await affected(`UPDATE public.worksites SET completed_at = now() WHERE id = $1`, [WS]) === 0, 'Sam : un UPDATE direct du statut touche 0 ligne (aucune règle d’écriture pour lui)');
  ck(await affected(`UPDATE public.worksites SET completed_at = NULL, completed_by = NULL WHERE id = $1`, [WS_B]) === 0, 'Sam : il ne peut pas rouvrir un chantier d’un UPDATE direct');
  ck(await affected(`UPDATE public.worksites SET completed_at = now()`) === 0, 'Sam : un UPDATE sans filtre touche 0 ligne');
  ck(await same(), 'Sam : rien n’a bougé');
  await as(CHEF);
  ck(await affected(`UPDATE public.worksites SET completed_at = now() WHERE id = $1`, [WS]) === 0, 'le chef d’équipe est un salarié : UPDATE direct = 0 ligne');
  // Il a le droit d'INSÉRER un chantier (règle d'origine) : jamais déjà terminé.
  await as(SAM);
  {
    const ins = await one(`INSERT INTO public.worksites (company_id, client_name, completed_at, completed_by) VALUES ($1, 'Né terminé ?', '2026-10-01', $2) RETURNING completed_at, completed_by`, [CO, SAM]);
    ck(ins.completed_at === null && ins.completed_by === null, 'Sam insère un chantier en forçant le statut : la base le remet à NULL (le chantier est créé, jamais terminé)');
    const ins2 = await errOf(`INSERT INTO public.worksites (company_id, client_name) VALUES ($1, 'Autre entreprise')`, [CO2]);
    ck(ins2 !== null, 'Sam ne peut pas insérer un chantier dans une autre entreprise (règle d’origine intacte)');
  }
  await as(SAM);
  ck(!(await errOf(`SELECT public.set_worksite_client_email($1, 'client@exemple.fr')`, [WS_B])), 'la fonction « e-mail du client » du salarié marche toujours…');
  await root();
  ck(JSON.stringify(await status(WS_B)) === stBefore && (await one('SELECT client_email FROM public.worksites WHERE id = $1', [WS_B])).client_email === 'client@exemple.fr', '…et ne touche pas au statut du chantier terminé');
  // Autre entreprise
  await as(ADMIN2);
  {
    const e = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, '2026-10-09']);
    ck(e?.code === 'P0002' && /introuvable/.test(e.msg), 'le bureau d’une AUTRE entreprise : le chantier est « introuvable » (rien n’est dit sur son existence)');
    const e2 = await errOf(`SELECT public.set_worksite_completed($1, NULL)`, [WS_B]);
    ck(e2?.code === 'P0002', 'il ne peut pas rouvrir le chantier d’un concurrent non plus');
    ck(await affected(`UPDATE public.worksites SET completed_at = now() WHERE id = $1`, [WS]) === 0, 'ni par un UPDATE direct (0 ligne)');
    ck(await same(), 'rien n’a bougé');
    await as(ADMIN2);
    const e3 = await errOf(`SELECT public.set_worksite_completed(NULL, '2026-10-09')`);
    ck(e3?.code === 'P0002', `chantier vide (NULL) : introuvable ${e3 ? e3.code + ' ' + e3.msg : 'pas d’erreur'}`);
    const e4 = await errOf(`SELECT public.set_worksite_completed($1, '2026-10-09')`, ['99999999-9999-9999-9999-999999999999']);
    ck(e4?.code === 'P0002', `chantier inexistant : introuvable ${e4 ? e4.code + ' ' + e4.msg : 'pas d’erreur'}`);
  }
  // Compte support (lot 5) : bureau de SA propre entreprise, en visite chez CO → lecture seule
  await as(SUPPORT); await support(CO);
  {
    ck((await rows(`SELECT 1 FROM public.worksites WHERE id = $1`, [WS])).length === 1, 'support en visite : il LIT les chantiers de l’entreprise visitée (lot 5)');
    const e = await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, '2026-10-09']);
    ck(e?.code === 'P0002', 'support en visite : terminer un chantier du client est refusé (introuvable) — lecture seule');
    const e2 = await errOf(`SELECT public.set_worksite_completed($1, NULL)`, [WS_B]);
    ck(e2?.code === 'P0002', 'support en visite : rouvrir aussi');
    ck(await affected(`UPDATE public.worksites SET completed_at = now() WHERE id = $1`, [WS]) === 0, 'support en visite : UPDATE direct = 0 ligne');
    ck(await same(), 'support en visite : rien n’a bougé');
  }
  await support('');
  // Anonyme
  await as(null, 'anon');
  ck((await errOf(`SELECT public.set_worksite_completed($1, $2)`, [WS, '2026-10-09']))?.code === '42501', 'anonyme : refusé (aucun droit d’exécution)');
  ck(await affected(`UPDATE public.worksites SET completed_at = now()`).catch(() => 0) === 0, 'anonyme : UPDATE direct sans effet');
  ck(await same(), 'rien n’a bougé');

  // L'éditeur SQL / la clé de service (pas d'auth.uid()) ne sont pas contrôlés, comme les autres gardes.
  await root();
  ck(await affected(`UPDATE public.worksites SET completed_at = completed_at WHERE id = $1`, [WS]) === 1, 'éditeur SQL : toujours possible (aucun auth.uid() : pas de contrôle)');
  // Le bureau garde la main directe d'avant (règle worksites_admin_write inchangée)
  await as(ADMIN);
  ck(await affected(`UPDATE public.worksites SET city = 'Lyon 3' WHERE id = $1`, [WS]) === 1, 'le bureau modifie toujours la fiche client comme avant');

  // ═══ Le bilan = les chiffres de Coût chantiers et du registre des réserves ═
  section(`Le bilan annonce les mêmes chiffres que Coût chantiers, le registre des réserves et les sommes SQL — ${titre}`);
  await as(ADMIN); await db.query(`SELECT public.set_worksite_completed($1, '2026-10-09')`, [WS]);   // le bilan d'un chantier TERMINÉ
  const labourRaw = await rows(`SELECT worksite_id, user_id, worked_minutes::int AS worked_minutes, route_minutes::int AS route_minutes, paid_minutes::int AS paid_minutes, cost::float AS cost, unpriced_minutes::int AS unpriced_minutes FROM public.my_worksite_labour(NULL, NULL)`);
  const entriesRaw = await rows(`SELECT id, user_id, work_date::text AS work_date, status, total_minutes::int AS total_minutes, reception, observation, reserve_resolved_at, reserve_fixed_at
    FROM public.time_entries WHERE company_id = $1 AND worksite_id = $2 AND status IN ('draft','submitted','validated') ORDER BY work_date DESC, id`, [CO, WS]);
  const usersRaw = await rows(`SELECT id, first_name, last_name FROM public.users WHERE company_id = $1`, [CO]);
  const expRaw = await rows(`SELECT category, amount::float AS amount FROM public.worksite_expenses WHERE company_id = $1 AND worksite_id = $2`, [CO, WS]);
  const docRaw = await rows(`SELECT category FROM public.documents WHERE company_id = $1 AND worksite_id = $2`, [CO, WS]);
  const wsRow = await one(`SELECT budget_hours::float AS h, budget_amount::float AS a, completed_at FROM public.worksites WHERE id = $1`, [WS]);
  const liftedRule = (e) => !!(e.reserve_resolved_at || e.reserve_fixed_at); // lib/reserves.ts (isReserveLifted), même définition
  const names = Object.fromEntries(usersRaw.map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]));
  const bilan = core.buildBilan({
    worksiteId: WS, completedDay: String(new Date(wsRow.completed_at).toISOString()).slice(0, 10), labour: labourRaw,
    entries: entriesRaw.map((e) => ({ ...e, lifted: liftedRule(e) })), names, expenses: expRaw, docs: docRaw, budget: { hours: wsRow.h, amount: wsRow.a }, office: true,
  });
  // 1) Heures : la règle de Coût chantiers (somme des lignes du chantier, champ par champ).
  const costReportMinutes = labourRaw.filter((r) => r.worksite_id === WS).reduce((s, r) => s + Number(r.paid_minutes || 0), 0);
  const costReportRoute = labourRaw.filter((r) => r.worksite_id === WS).reduce((s, r) => s + Number(r.route_minutes || 0), 0);
  const costReportCost = labourRaw.filter((r) => r.worksite_id === WS).reduce((s, r) => s + Number(r.cost || 0), 0);
  ck(bilan.hours.paidMinutes === costReportMinutes && bilan.hours.routeMinutes === costReportRoute && bilan.hours.cost === costReportCost, `heures / route / coût du bilan = ceux de Coût chantiers (${bilan.hours.paidMinutes} min dont ${bilan.hours.routeMinutes} de route, ${bilan.hours.cost} €)`);
  // Calcul à la main du jeu de données : Sam 240 + 240 + 1 h de route + 240 (30 min de pause) ; Alex 420 ; Léa 0
  const sam = bilan.hours.workers.find((w) => w.userId === SAM), alex = bilan.hours.workers.find((w) => w.userId === ALEX), lea = bilan.hours.workers.find((w) => w.userId === LEA);
  ck(sam.paidMinutes === 240 + 240 + 60 + 240 && sam.routeMinutes === 60, `Sam : 4 h + 4 h + 1 h de route + 4 h (30 min de pause) = ${sam.paidMinutes} min payées (calcul à la main : 780)`);
  ck(alex.paidMinutes === 420 && alex.cost === 0 && alex.unpricedMinutes === 420, 'Alex : 7 h, sans taux horaire → coût 0 et 420 min « sans taux » (coût annoncé incomplet)');
  ck(sam.cost === (780 / 60) * 40, `Sam : coût = 13 h × 40 €/h = ${sam.cost} €`);
  ck(lea.paidMinutes === 0 && lea.draftMinutes === 180, 'Léa : aucune heure comptée, 3 h en attente (brouillon) ; son brouillon vide n’y est pas');
  ck(bilan.hours.draftMinutes === 180 + 180, `heures en attente = brouillons : Sam 3 h + Léa 3 h = ${bilan.hours.draftMinutes} min`);
  ck(bilan.hours.paidMinutes === 780 + 420, 'heures comptées = 13 h + 7 h : NI les brouillons, NI l’intervention retirée (8 h), NI les 4 h de Sam sur l’autre chantier');
  // Somme SQL indépendante (sans route) pour la partie « heures travaillées »
  await root();
  const sqlWorked = await count(`SELECT sum(total_minutes) n FROM public.time_entries WHERE worksite_id = $1 AND status IN ('submitted','validated')`, [WS]);
  ck(sqlWorked === 240 + 240 + 240 + 420 && sqlWorked + bilan.hours.routeMinutes === bilan.hours.paidMinutes, `somme SQL indépendante des heures qui comptent (${sqlWorked}) + la route (${bilan.hours.routeMinutes}) = heures du bilan (${bilan.hours.paidMinutes})`);
  const sqlDrafts = await count(`SELECT sum(total_minutes) n FROM public.time_entries WHERE worksite_id = $1 AND status = 'draft' AND total_minutes > 0`, [WS]);
  ck(sqlDrafts === bilan.hours.draftMinutes, `brouillons : somme SQL (${sqlDrafts}) = bilan (${bilan.hours.draftMinutes})`);
  // 2) Période
  ck(bilan.period.first === '2026-09-14' && bilan.period.last === '2026-10-02' && bilan.period.completed === '2026-10-09', 'période : première intervention 14/09, dernière 02/10 (les brouillons et la ligne retirée n’y sont pas), fin 09/10');
  // 3) Réserves : la règle du registre (reception = avec, heures qui comptent), « levée » = bureau OU salarié
  await root();
  const regAll = await count(`SELECT count(*) n FROM public.time_entries WHERE worksite_id = $1 AND reception = 'avec' AND status IN ('submitted','validated')`, [WS]);
  const regLifted = await count(`SELECT count(*) n FROM public.time_entries WHERE worksite_id = $1 AND reception = 'avec' AND status IN ('submitted','validated') AND (reserve_resolved_at IS NOT NULL OR reserve_fixed_at IS NOT NULL)`, [WS]);
  ck(bilan.reserves.open + bilan.reserves.lifted === regAll && bilan.reserves.lifted === regLifted && bilan.reserves.open === 1 && bilan.reserves.lifted === 2, `réserves : ${bilan.reserves.open} ouverte et ${bilan.reserves.lifted} levées (une par le salarié, une par le bureau) = le registre (${regAll} au total, ${regLifted} levées)`);
  ck(bilan.reserves.openList.length === 1 && bilan.reserves.openList[0].text === 'Joint à reprendre côté cuisine' && bilan.reserves.openList[0].who === 'Sam Girard', 'la réserve à lever est nommée (qui, quoi)');
  // 4) Dépenses
  await root();
  const sqlExp = await one(`SELECT sum(amount)::float AS t, count(*)::int AS c FROM public.worksite_expenses WHERE worksite_id = $1`, [WS]);
  ck(bilan.expenses.total === sqlExp.t && bilan.expenses.count === sqlExp.c && bilan.expenses.total === 1100, `dépenses : ${bilan.expenses.total} € sur ${bilan.expenses.count} lignes = somme SQL (l’avoir de −50 € est compté)`);
  ck(JSON.stringify(bilan.expenses.byCategory.map((c) => [c.key, c.total])) === JSON.stringify([['materiaux', 1000], ['location', 150], ['autre', -50]]), 'dépenses par catégorie : Matériaux 1 000, Location 150, Divers −50');
  // 5) Documents : par catégorie, factures comprises (le bilan est une fenêtre du bureau)
  const sqlDocs = await rows(`SELECT coalesce(category, 'sans_categorie') AS k, count(*)::int AS n FROM public.documents WHERE worksite_id = $1 GROUP BY 1`, [WS]);
  const bd = Object.fromEntries(bilan.documents.byCategory.map((c) => [c.key, c.count]));
  ck(sqlDocs.every((d) => bd[d.k] === d.n) && bilan.documents.total === 7 && bd.facture === 1 && bd.facture_payee === 1, 'documents : nombre par catégorie = GROUP BY SQL ; le bureau voit ses 2 factures dans le décompte');
  const coreWorker = core.buildBilan({ worksiteId: WS, completedDay: null, labour: [], entries: [], names, expenses: [], docs: docRaw, budget: { hours: null, amount: null }, office: false });
  ck(coreWorker.documents.total === 5 && !coreWorker.documents.byCategory.some((c) => c.key.startsWith('facture')), 'sans droit du bureau : les 2 factures disparaissent du décompte (5 documents)');
  // 6) Budget prévu / réel : 13 h + 7 h = 20 h sur 40 h ; 520 € sur 1 600 €
  ck(bilan.budget.hoursLine && Math.round(bilan.budget.hoursLine.pct) === 50 && bilan.budget.amountLine && Math.round(bilan.budget.amountLine.pct) === Math.round(520 / 1600 * 100) && bilan.budget.amountLine.incomplete === true, 'budget : 20 h sur 40 h (50 %), 520 € sur 1 600 € (33 %), « incomplet » car un salarié n’a pas de taux');
  ck(JSON.stringify(bilan.budget.progress) === JSON.stringify(core.budgetProgress({ hours: 40, amount: 1600, usedMinutes: costReportMinutes, usedCost: costReportCost })), 'budget : même résultat que la fonction budgetProgress de Coût chantiers appelée avec les mêmes sommes');
  ck(Math.abs(bilan.totalCost - (costReportCost + 1100)) < 1e-9, `coût total = main-d’œuvre + dépenses = ${bilan.totalCost} € (la carte « Total » de Coût chantiers)`);
  // 7) Le bilan d'un chantier ne voit jamais l'autre chantier
  ck(bilan.expenses.total === 1100 && bilan.documents.total === 7, 'le bilan de ce chantier ne contient ni les dépenses (999 €) ni le plan de l’autre chantier');
  // 8) Un salarié n'obtient rien de tout cela de la base (taux horaires, dépenses)
  await as(SAM);
  ck((await errOf(`SELECT * FROM public.my_worksite_labour(NULL, NULL)`))?.msg?.includes('Réservé'), 'Sam : my_worksite_labour lui est refusée (les taux horaires de ses collègues restent secrets)');
  ck(await count(`SELECT count(*) n FROM public.worksite_expenses`) === 0, 'Sam : les dépenses (montants d’achat) lui sont fermées (0 ligne visible sur 5)');

  // ═══ Aucun blocage dur sur les écritures (essais dans une transaction annulée) ═══
  section(`Aucun blocage en base sur un chantier terminé — ${titre}`);
  await root();
  await db.exec('BEGIN');
  await as(SAM);
  {
    const te = await errOf(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, '2026-10-13', '08:00', '09:00', 'draft')`, [CO, SAM, WS]);
    const pl = await errOf(`INSERT INTO public.planning (company_id, user_id, worksite_id, work_date) VALUES ($1, $2, $3, '2026-10-14')`, [CO, SAM, WS]);
    const ac = await errOf(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, '2026-10-13')`, [SAM, CO, WS]);
    const up = await errOf(`UPDATE public.time_entries SET status = 'submitted' WHERE id = 'b0000000-0000-0000-0000-000000000004'`);
    ck(!te && !pl && !ac && !up, 'sur le chantier TERMINÉ : un pointage, une intervention planifiée, un pointage en cours et l’envoi d’un brouillon passent encore — la base ne bloque rien, le masquage est dans les listes de l’application');
  }
  await db.exec('ROLLBACK');
  await root();
  ck(await count(`SELECT count(*) n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.time_entries'::regclass, 'public.planning'::regclass, 'public.active_sessions'::regclass, 'public.documents'::regclass, 'public.worksite_expenses'::regclass) AND tgname LIKE '%complet%'`) === 0,
    'aucun déclencheur du lot sur time_entries, planning, active_sessions, documents, worksite_expenses');
  ck(await dataPrint() === dataBefore, 'et l’essai annulé n’a rien laissé');

  // ═══ Retour arrière puis rejouée ═══════════════════════════════════════
  section(`Retour arrière (neutralisation), puis migration rejouée — ${titre}`);
  await root();
  const stateBefore = JSON.stringify(await rows(`SELECT id, completed_at, completed_by FROM public.worksites ORDER BY id`));
  const dataMid = await dataPrint();
  ck(!(await errExec(ROLLBACK_SQL)), 'le RETOUR ARRIÈRE de l’en-tête, copié tel quel (sans « -- »), s’exécute sans erreur');
  {
    const r = await one(`SELECT (SELECT count(*) FROM pg_proc WHERE proname = ANY($1))::int AS f, (SELECT count(*) FROM pg_trigger WHERE tgname = ANY($2))::int AS t,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'worksites' AND column_name IN ('completed_at','completed_by'))::int AS c,
      has_function_privilege('authenticated', 'public.worksite_completion_ready()', 'EXECUTE') AS ra, has_function_privilege('anon', 'public.worksite_completion_ready()', 'EXECUTE') AS rn,
      has_function_privilege('authenticated', 'public.set_worksite_completed(uuid, date)', 'EXECUTE') AS sa, has_function_privilege('anon', 'public.set_worksite_completed(uuid, date)', 'EXECUTE') AS sn`, [NEW_FNS, NEW_TRIGGERS]);
    ck(r.f === 3 && r.t === 1 && r.c === 2, 'rien n’est retiré : les 3 fonctions, le déclencheur et les 2 colonnes sont toujours là');
    ck(!r.ra && !r.rn && !r.sa && !r.sn, 'mais « prête » et « terminer » ne sont plus appelables par personne (connectés comme anonymes)');
    ck(JSON.stringify(await rows(`SELECT id, completed_at, completed_by FROM public.worksites ORDER BY id`)) === stateBefore && await dataPrint() === dataMid, 'les chantiers déjà terminés le restent, les données sont intactes');
    ck(await otherFns() === fnsBefore && await otherTriggers() === trgBefore, 'les fonctions et déclencheurs d’origine sont toujours identiques');
    await as(SAM);
    ck((await errOf('SELECT public.worksite_completion_ready()'))?.code === '42501', 'après retour arrière : « prête » est refusée à un connecté (l’application se recache sans message : toute erreur = « pas prête »)');
    await as(ADMIN);
    ck((await errOf(`SELECT public.set_worksite_completed($1, '2026-10-09')`, [WS]))?.code === '42501' && (await errOf(`SELECT public.set_worksite_completed($1, NULL)`, [WS_B]))?.code === '42501', 'plus personne, pas même le bureau, ne peut poser ou retirer le statut par la fonction');
    await as(SAM);
    ck(core.isWorksiteFinished({ completed_at: (await rows(`SELECT completed_at FROM public.worksites WHERE id = $1`, [WS_B]))[0].completed_at }), 'un chantier terminé reste masqué des listes de choix du salarié (c’est la donnée qui décide)');
    const ins = await one(`INSERT INTO public.worksites (company_id, client_name, completed_at) VALUES ($1, 'Encore né terminé ?', '2026-10-01') RETURNING completed_at`, [CO]);
    ck(ins.completed_at === null, 'le garde reste actif : un salarié qui insère un chantier avec un statut forcé le voit remis à vide');
    await as(ADMIN);
    ck(await affected(`UPDATE public.worksites SET city = 'Lyon 4' WHERE id = $1`, [WS]) === 1, 'le bureau modifie toujours la fiche client comme avant');
  }
  await root();
  ck(!(await errExec(SQL)), 'la migration se rejoue après un retour arrière');
  {
    const v = await one(POST_SQL.replace(/;\s*$/, ''));
    const vals = Object.values(v);
    ck(vals.length === 9 && vals.every((x) => x === true), `et la VÉRIFICATION rend de nouveau ${vals.length} × true`);
    ck(JSON.stringify(await rows(`SELECT id, completed_at, completed_by FROM public.worksites WHERE id = ANY($1) ORDER BY id`, [[WS, WS_B, WS2]])) === JSON.stringify(JSON.parse(stateBefore).filter((x) => [WS, WS_B, WS2].includes(x.id)).map((x) => ({ ...x, completed_at: x.completed_at ? new Date(x.completed_at) : null }))), 'les statuts posés avant le retour arrière sont toujours là');
    await as(SAM);
    ck((await one('SELECT public.worksite_completion_ready() AS r')).r === true, '« prête » répond de nouveau true');
    await as(ADMIN);
    const back = await one(`SELECT public.set_worksite_completed($1, NULL) AS at`, [WS_B]);
    ck(back.at === null && (await status(WS_B)).completed_at === null, 'et le bureau peut de nouveau rouvrir');
  }
  await db.close();
}

await suite('absente');
await suite('presente');

console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
