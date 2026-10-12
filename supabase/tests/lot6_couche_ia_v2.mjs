// Lot 6 — couche IA v2 : assistant_context (qui je suis + quota, avec le jeton
// de la personne), le quota des lectures de bulletin et le compteur global du
// projet. Rejoué POUR DE VRAI sur un Postgres jetable (PGlite). Jamais sur une
// vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:couche-ia   (PGLITE_DIR=… pour un autre dossier)
//
// État de la production : companies / users (bouchon), les droits PAR DÉFAUT de
// production (tout pour anon / authenticated sur les objets neufs), puis les
// lots 3 (assistant_usage, assistant_consume) et 4 (worker_assistant_usage,
// worker_assistant_consume) TELS QUELS, avec des compteurs déjà là. Le fichier
// du lot 6 est chargé TEL QUEL, deux fois ; la vérification de son en-tête doit
// renvoyer 8 × true ; son RETOUR ARRIÈRE (en-tête) est exécuté, puis il est
// rechargé. Un contrôle automatique enregistre tout DROP et tout DELETE
// réellement exécutés pendant le chargement et les appels.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const SQL3 = mig('20260929160000_lot3_assistant_bureau.sql');
const SQL4 = mig('20260929170000_lot4_assistant_salarie.sql');
const SQL = mig('20261012090000_lot6_couche_ia_v2.sql');
const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';
let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}

const CO = 'c0000000-0000-0000-0000-000000000001';   // IA allumée
const CO2 = 'c0000000-0000-0000-0000-000000000002';  // autre entreprise, IA allumée
const CO3 = 'c0000000-0000-0000-0000-000000000003';  // IA coupée
const ADMIN = 'a0000000-0000-0000-0000-00000000000a';
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b';
const ADMIN3 = 'a0000000-0000-0000-0000-00000000000c';
const OLD = 'a0000000-0000-0000-0000-00000000000d';    // bureau parti (inactif)
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const AUTRE = '70000000-0000-0000-0000-000000000007';
const SANS = '90000000-0000-0000-0000-000000000009';   // compte sans ligne users

const STUB = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE public.companies (id uuid PRIMARY KEY, name text, ai_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), role text,
  is_active boolean DEFAULT true, first_name text, last_name text);
INSERT INTO public.companies VALUES ('${CO}', 'Entreprise Test', true), ('${CO2}', 'Autre Test', true), ('${CO3}', 'Sans IA', false);
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${ADMIN3}', '${CO3}', 'admin', true, 'Bureau', 'SansIA'),
  ('${OLD}', '${CO}', 'admin', false, 'Ancien', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'),
  ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', NULL, 'Alex', 'Test'),
  ('${AUTRE}', '${CO2}', 'worker', true, 'Autre', 'Salarié');
-- Policies de PRODUCTION (lecture de sa ligne / de son entreprise).
GRANT SELECT ON public.users, public.companies TO authenticated;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY companies_mine ON public.companies FOR SELECT TO authenticated
  USING (id = (SELECT u.company_id FROM public.users u WHERE u.id = auth.uid()));
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);
const db = new PGlite();
await db.exec(STUB);
// Comme Supabase : tout pour anon, authenticated ET service_role sur les objets neufs.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;`);
await db.exec(SQL3);
await db.exec(SQL4);

const as = async (uid, role = 'authenticated') => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`SET ROLE ${role}`);
};
const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); };
const err = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return e.code || e.message; } };
const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];
const ctx = async (side, limit, tier = null, glim = null) =>
  (await one(`SELECT public.assistant_context($1, $2, $3, $4) AS r`, [side, limit, tier, glim])).r;
const n = async (sql, p = []) => Number((await one(sql, p))?.n ?? 0);

// ═══ Contrôle automatique : tout DROP et tout DELETE réellement exécutés ═══
await db.exec(`
CREATE TABLE public.zz_controle (quand timestamptz DEFAULT clock_timestamp(), quoi text);
CREATE FUNCTION public.zz_drop() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
    INSERT INTO public.zz_controle (quoi) VALUES ('DROP ' || r.object_type || ' ' || coalesce(r.object_identity, ''));
  END LOOP; END $$;
CREATE FUNCTION public.zz_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO public.zz_controle (quoi) VALUES ('DELETE ' || TG_TABLE_NAME); RETURN NULL; END $$;
CREATE TRIGGER zz_del_au AFTER DELETE ON public.assistant_usage FOR EACH STATEMENT EXECUTE FUNCTION public.zz_delete();
CREATE TRIGGER zz_del_wu AFTER DELETE ON public.worker_assistant_usage FOR EACH STATEMENT EXECUTE FUNCTION public.zz_delete();
CREATE TRIGGER zz_del_us AFTER DELETE ON public.users FOR EACH STATEMENT EXECUTE FUNCTION public.zz_delete();
CREATE TRIGGER zz_del_co AFTER DELETE ON public.companies FOR EACH STATEMENT EXECUTE FUNCTION public.zz_delete();
`);
let eventTrigger = true;
try { await db.exec(`CREATE EVENT TRIGGER zz_drop ON sql_drop EXECUTE FUNCTION public.zz_drop();`); } catch { eventTrigger = false; }
const controle = async () => (await rows(`SELECT quoi FROM public.zz_controle ORDER BY quand`)).map((r) => r.quoi);

// L'en-tête : RETOUR ARRIÈRE, VÉRIFICATION, HISTORIQUE (lignes « --   … »).
const header = SQL.slice(0, SQL.indexOf('-- ─────'));
const block = (from, to) => header.slice(header.indexOf(from), header.indexOf(to)).split('\n').slice(1)
  .filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n').trim();
const ROLLBACK_SQL = block('-- RETOUR ARRIÈRE', '-- VÉRIFICATION');
const POST_SQL = block('-- VÉRIFICATION', '-- HISTORIQUE');
const HISTO_SQL = header.slice(header.indexOf('-- HISTORIQUE')).split('\n').slice(1).filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n').trim();

// ═══ Avant : compteurs des lots 3 et 4 déjà là ═════════════════════════════
section('Avant le lot 6 : les quotas des lots 3 et 4 tournent avec la clé de service');
await as(null, 'service_role');
await one(`SELECT public.assistant_consume($1, 50)`, [CO]);
await one(`SELECT public.worker_assistant_consume($1, 20)`, [SAM]);
await root();
const oldCounts = JSON.stringify(await rows(`SELECT 'b' k, company_id::text id, day, questions n FROM public.assistant_usage
  UNION ALL SELECT 's', user_id::text, day, requests FROM public.worker_assistant_usage ORDER BY 1, 2`));
check(oldCounts.includes(CO) && oldCounts.includes(SAM), 'un compteur bureau et un compteur salarié existent déjà');
check((await err(`SELECT public.assistant_context('bureau', 50)`)) === '42883', 'sans le lot 6 : assistant_context absente (42883) — les fonctions déployées ne l’appellent pas');

// ═══ La migration : additive, rejouable ════════════════════════════════════
section('Migration : additive, rejouable, en-tête complet');
const NEW_FN = 'assistant_context', NEW_T = 'ai_project_usage', NEW_T2 = 'ai_bulletin_usage';
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)) || ':' || coalesce(array_to_string(proacl, ','), ''), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname <> $1 AND proname NOT LIKE 'zz_%'`, [NEW_FN])).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal AND tgname NOT LIKE 'zz_%'`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name NOT IN ($1, $2)`, [NEW_T, NEW_T2])).s;
const conPrint = async () => (await one(`SELECT string_agg(conrelid::regclass::text || '.' || conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY 1) AS s
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid IS DISTINCT FROM to_regclass('public.${NEW_T}') AND conrelid IS DISTINCT FROM to_regclass('public.${NEW_T2}')`)).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname,
    has_table_privilege(r.rolname, c.oid, 'SELECT') AS s, has_table_privilege(r.rolname, c.oid, 'INSERT') AS i,
    has_table_privilege(r.rolname, c.oid, 'UPDATE') AS u, has_table_privilege(r.rolname, c.oid, 'DELETE') AS d
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname NOT IN ('${NEW_T}', '${NEW_T2}', 'zz_controle') ORDER BY 1, 2`));
const rlsPrint = async () => JSON.stringify(await rows(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname NOT IN ('${NEW_T}', '${NEW_T2}') ORDER BY 1`));
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(), priv: await privPrint(), rls: await rlsPrint() });
const before = await prints();

// SQL exécutable = le fichier sans ses commentaires (lignes « -- », fins de ligne « -- », blocs).
const code = SQL.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/--.*$/, '')).filter((l) => l.trim()).join('\n');
check(!/\b(DROP|DELETE|TRUNCATE)\b|\bON\s+DELETE\b/i.test(code), 'SQL exécutable : aucun DROP, DELETE, TRUNCATE ni ON DELETE (mots entiers, corps de fonction compris)');
check(!/DROP|DELETE|TRUNCATE/i.test(code), 'SQL exécutable : ces mots n’apparaissent même pas comme morceau d’un autre mot ou d’une chaîne');
check(!/\bRENAME\b|\bALTER\s+(COLUMN|POLICY|FUNCTION)\b/i.test(code), 'migration additive : ni RENAME, ni ALTER COLUMN / POLICY / FUNCTION');
check(!/\bCREATE POLICY\b/i.test(code), 'aucune policy neuve (et donc aucune policy FOR DELETE)');
check((code.match(/\bALTER TABLE public\.(\w+)/g) || []).every((x) => x.endsWith(NEW_T) || x.endsWith(NEW_T2)), `seules les tables neuves ${NEW_T} et ${NEW_T2} sont modifiées`);
check((code.match(/\b(REVOKE|GRANT)\b[^;]*/g) || []).every((x) => new RegExp(`${NEW_T}|${NEW_T2}|${NEW_FN}`).test(x)), 'REVOKE / GRANT seulement sur les objets neufs');
check(/UPDATE public\.ai_project_usage/.test(code) && (code.match(/\bUPDATE public\.(\w+)/g) || []).every((x) => x.endsWith(NEW_T)),
  'la seule mise à jour de données est le +1 du compteur neuf (dans la fonction)');
check((code.match(/\bINSERT INTO public\.(\w+)/g) || []).every((x) => /assistant_usage|worker_assistant_usage|ai_project_usage|ai_bulletin_usage/.test(x)),
  'les seuls ajouts de données sont des +1 de compteurs (dans la fonction)');
check(!/\bREFERENCES\b|\bFOREIGN KEY\b/i.test(code), 'aucune clé étrangère (un compteur ne bloque jamais la suppression d’une entreprise)');
check(!!ROLLBACK_SQL && !!POST_SQL && /INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\s+VALUES \('20261012090000', 'lot6_couche_ia_v2'\) ON CONFLICT DO NOTHING;/.test(HISTO_SQL),
  'en-tête : RETOUR ARRIÈRE, VÉRIFICATION et HISTORIQUE (même nom que le fichier)');
check((ROLLBACK_SQL.match(/\bDROP\b/g) || []).length === 1 && /^DROP FUNCTION IF EXISTS public\.assistant_context\(/m.test(ROLLBACK_SQL)
  && !/\bDELETE\s+FROM\b|^\s*TRUNCATE\b/im.test(ROLLBACK_SQL + POST_SQL + HISTO_SQL),
  'retour arrière : un seul DROP (la fonction neuve), aucune instruction DELETE nulle part (DELETE n’y est qu’un nom de droit vérifié)');

await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
{
  const c = await controle();
  check(c.length === 0, `deux chargements : aucun DROP ni DELETE réellement exécuté${eventTrigger ? ' (déclencheur sql_drop + déclencheurs DELETE)' : ''}${c.length ? ` (${c.join(' ; ')})` : ''}`);
}
check((await n(`SELECT count(*) AS n FROM pg_constraint WHERE conname = 'ai_project_usage_tier_check'`)) === 1, 'la contrainte des niveaux n’est posée qu’une fois');
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées, droits compris (assistant_consume, worker_assistant_consume…)');
check(before.pol === after.pol, 'policies existantes inchangées');
check(before.trg === after.trg, 'triggers existants inchangés, aucun trigger ajouté');
check(before.col === after.col, 'aucune colonne existante ajoutée ni modifiée');
check(before.con === after.con, 'contraintes existantes inchangées');
check(before.priv === after.priv, 'droits des tables existantes inchangés (anon, authenticated, service_role)');
check(before.rls === after.rls, 'RLS des tables existantes inchangée');
check(JSON.stringify(await rows(`SELECT 'b' k, company_id::text id, day, questions n FROM public.assistant_usage
  UNION ALL SELECT 's', user_id::text, day, requests FROM public.worker_assistant_usage ORDER BY 1, 2`)) === oldCounts, 'compteurs existants intacts');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 8 && bad.length === 0, `vérification d’en-tête : 8 × true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}

// Le contrôle surveille aussi les tables neuves (déclencheurs posés après les comparaisons ci-dessus).
await db.exec(`
CREATE TRIGGER zz_del_ap AFTER DELETE ON public.ai_project_usage FOR EACH STATEMENT EXECUTE FUNCTION public.zz_delete();
CREATE TRIGGER zz_del_ab AFTER DELETE ON public.ai_bulletin_usage FOR EACH STATEMENT EXECUTE FUNCTION public.zz_delete();`);

// ═══ Qui je suis, en un aller-retour ═══════════════════════════════════════
section('assistant_context : qui je suis, mon entreprise, ai_enabled, quota');
await root();
await db.exec(`DELETE FROM public.assistant_usage; DELETE FROM public.worker_assistant_usage;`); // remise à zéro DU BANC (avant le contrôle)
await db.exec(`DELETE FROM public.zz_controle`);
await as(ADMIN);
{
  const r = await ctx('bureau', 3);
  check(r.ok === true && r.user_id === ADMIN && r.company_id === CO && r.role === 'admin' && r.ai_enabled === true, 'bureau : ok, user_id, company_id, rôle, ai_enabled en un appel');
  check(r.used === 1 && r.remaining === 2 && r.projet_used === null, 'bureau : 1re demande comptée, 2 restantes ; pas de plafond global (formule payante / anciens réglages)');
  await ctx('bureau', 3);
  const r3 = await ctx('bureau', 3);
  check(r3.ok && r3.used === 3 && r3.remaining === 0, '3e demande = limite atteinte pile');
  const r4 = await ctx('bureau', 3);
  check(r4.ok === false && r4.raison === 'quota' && r4.limite === 3, '4e demande refusée : « quota »');
  await root();
  check((await n(`SELECT questions AS n FROM public.assistant_usage WHERE company_id = $1`, [CO])) === 3, 'un refus ne compte pas (même règle que assistant_consume)');
  check((await n(`SELECT count(*) AS n FROM public.assistant_usage WHERE company_id = $1 AND day = (now() AT TIME ZONE 'Europe/Paris')::date`, [CO])) === 1, 'même ligne que le lot 3 : (entreprise, jour de Paris)');
}
await as(ADMIN);
check((await ctx('bureau', 0)).raison === 'quota', 'limite 0 = assistant coupé (comme le lot 3)');
check((await ctx('bureau', null)).raison === 'quota', 'limite absente = assistant coupé');
await as(ADMIN2);
{
  const r = await ctx('bureau', 3);
  check(r.ok && r.company_id === CO2 && r.used === 1, 'autre entreprise : SON compteur, à 1 (le nôtre ne la gêne pas)');
}
await root();
check((await n(`SELECT questions AS n FROM public.assistant_usage WHERE company_id = $1`, [CO])) === 3, 'autre entreprise : notre compteur inchangé');

section('Côtés et rôles : rien n’est compté quand c’est refusé');
await as(SAM);
check((await ctx('bureau', 50)).raison === 'non_autorise', 'salarié côté bureau : non autorisé');
check((await ctx('bulletin', 50)).raison === 'non_autorise', 'salarié : pas de lecture de bulletin');
await as(CHEF);
check((await ctx('bulletin', 50)).raison === 'non_autorise', 'chef d’équipe : pas de lecture de bulletin');
await as(SAM);
{
  const r = await ctx('salarie', 2);
  check(r.ok && r.user_id === SAM && r.company_id === CO && r.role === 'worker' && r.used === 1 && r.remaining === 1, 'salarié : ok, quota PAR salarié (1/2)');
  await ctx('salarie', 2);
  check((await ctx('salarie', 2)).raison === 'quota', 'salarié : 3e demande refusée');
}
await as(CHEF);
check((await ctx('salarie', 20)).ok === true, 'chef d’équipe : côté salarié ok');
check((await ctx('bureau', 20)).raison === 'non_autorise', 'chef d’équipe : pas côté bureau');
await as(ALEX);
check((await ctx('salarie', 20)).ok === true, 'compte actif « NULL » (jamais désactivé) : ok, comme is_active IS DISTINCT FROM false');
await as(ADMIN);
check((await ctx('salarie', 20)).raison === 'non_autorise', 'bureau côté salarié : non autorisé (comme worker-assistant)');
{
  // Bulletin (payslip-read) : bureau seulement, quota PROPRE (par entreprise et par jour), sans toucher au quota des questions.
  await root();
  const qBefore = await n(`SELECT coalesce(sum(questions), 0) AS n FROM public.assistant_usage`);
  await as(ADMIN);
  const r = await ctx('bulletin', 2);
  check(r.ok === true && r.company_id === CO && r.role === 'admin' && r.used === 1 && r.remaining === 1, 'bulletin : bureau ok, 1re lecture comptée (1/2)');
  await ctx('bulletin', 2);
  const r3 = await ctx('bulletin', 2);
  check(r3.ok === false && r3.raison === 'quota' && r3.limite === 2, 'bulletin : 3e lecture du jour refusée (« quota »)');
  await root();
  check((await n(`SELECT reads AS n FROM public.ai_bulletin_usage WHERE company_id = $1`, [CO])) === 2, 'bulletin : un refus ne compte pas');
  check((await n(`SELECT coalesce(sum(questions), 0) AS n FROM public.assistant_usage`)) === qBefore, 'bulletin : le quota des questions du bureau n’est pas touché');
  await as(ADMIN2);
  check((await ctx('bulletin', 2)).used === 1, 'bulletin : une autre entreprise a SON compteur');
  await root();
  check((await n(`SELECT reads AS n FROM public.ai_bulletin_usage WHERE company_id = $1`, [CO])) === 2, 'bulletin : notre compteur inchangé par l’autre entreprise');
  await as(ADMIN);
  check((await ctx('bulletin', 0)).raison === 'quota' && (await ctx('bulletin', null)).raison === 'quota', 'bulletin : limite 0 ou absente = lecture coupée');
}
await as(OLD);
check((await ctx('bureau', 50)).raison === 'non_autorise', 'compte désactivé : non autorisé');
await as(ADMIN3);
{
  const r = await ctx('bureau', 50);
  check(r.ok === false && r.raison === 'ia_coupee' && r.ai_enabled === false, 'entreprise sans IA : « ia_coupee », ai_enabled = false');
  await root();
  check((await n(`SELECT count(*) AS n FROM public.assistant_usage WHERE company_id = $1`, [CO3])) === 0, 'entreprise sans IA : rien compté');
}
await as(SANS);
check((await ctx('bureau', 50)).raison === 'non_autorise', 'jeton valide sans fiche utilisateur : non autorisé');
await as('');
check((await ctx('bureau', 50)).raison === 'non_connecte', 'authenticated sans identité : « non_connecte »');
await as(ADMIN);
check((await ctx('patron', 50)).raison === 'cote_inconnu' && (await ctx(null, 50)).raison === 'cote_inconnu', 'côté inconnu : refusé');
{
  await root();
  const b0 = await n(`SELECT questions AS n FROM public.assistant_usage WHERE company_id = $1`, [CO2]);
  await as(ADMIN2);
  const r = await ctx('bureau', 100000);
  check(r.ok && r.used + r.remaining === 200, 'bureau : limite 100000 passée par l’appelant bornée à 200 en base (un appel direct ne fait que consommer SON quota)');
  await root();
  check((await n(`SELECT questions AS n FROM public.assistant_usage WHERE company_id = $1`, [CO2])) === b0 + 1, 'appel direct : +1 sur SON entreprise seulement');
}

// ═══ Compteur global (formule essai) ═══════════════════════════════════════
section('Compteur global : plafond par jour pour TOUT le projet');
await root();
await db.exec(`DELETE FROM public.assistant_usage; DELETE FROM public.worker_assistant_usage; DELETE FROM public.zz_controle;`); // banc
await as(ADMIN);
{
  const r1 = await ctx('bureau', 50, 'documents', 2);
  check(r1.ok && r1.projet_used === 1, 'documents : 1/2 pour le projet');
  await as(ADMIN2);
  const r2 = await ctx('bureau', 50, 'documents', 2);
  check(r2.ok && r2.projet_used === 2, 'documents : une AUTRE entreprise compte dans le MÊME plafond (2/2)');
  await as(SAM);
  const r3 = await ctx('salarie', 20, 'documents', 2);
  check(r3.ok === false && r3.raison === 'pause' && r3.projet_used === 2, 'documents : 3e demande du projet → « pause »');
  await root();
  check((await n(`SELECT count(*) AS n FROM public.worker_assistant_usage WHERE user_id = $1`, [SAM])) === 0, 'pause : le quota du salarié n’est PAS consommé');
  await as(ADMIN);
  const r4 = await ctx('bureau', 50, 'rapide', 2);
  check(r4.ok && r4.projet_used === 1, 'rapide : plafond séparé des documents');
  const r5 = await ctx('bulletin', 50, 'documents', 2);
  check(r5.ok === false && r5.raison === 'pause', 'bulletin : lui aussi en pause au plafond documents');
  await root();
  check((await n(`SELECT coalesce(sum(reads), 0) AS n FROM public.ai_bulletin_usage`)) === 3, 'pause : le quota de bulletins n’est PAS consommé non plus');
  await as(ADMIN);
  const r6 = await ctx('bureau', 50, 'documents', null);
  check(r6.ok && r6.projet_used === null, 'formule payante (plafond NULL) : jamais en pause, compteur global non touché');
  await root();
  const g = await rows(`SELECT tier, requests, day = (now() AT TIME ZONE 'America/Los_Angeles')::date AS jour_google FROM public.ai_project_usage ORDER BY tier`);
  check(g.length === 2 && g.find((x) => x.tier === 'documents').requests === 2 && g.find((x) => x.tier === 'rapide').requests === 1 && g.every((x) => x.jour_google),
    'compteur : documents 2, rapide 1, jour de Google (Pacifique, remise à zéro vers 9 h à Paris)');
  check((await n(`SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_project_usage'`)) === 3, 'compteur : (jour, niveau, nombre), rien d’autre');
}
await as(CHEF);
{
  const r = await ctx('salarie', 1, 'rapide', 10);
  check(r.ok && r.projet_used === 2, 'chef : demande comptée dans le plafond rapide (2)');
  const q = await ctx('salarie', 1, 'rapide', 10);
  check(q.raison === 'quota', 'chef : son quota (1) est atteint → « quota »');
  await root();
  check((await n(`SELECT requests AS n FROM public.ai_project_usage WHERE tier = 'rapide'`)) === 2, 'refus « quota » : le compteur global n’avance PAS (atomique)');
}
await as(ADMIN);
check((await ctx('bureau', 50, 'pro', 10)).raison === 'niveau_inconnu' && (await ctx('bureau', 50, null, 10)).raison === 'niveau_inconnu', 'niveau inconnu avec plafond : refusé');
check((await ctx('bureau', 50, 'rapide', 0)).raison === 'pause', 'plafond 0 : en pause');
await root();
check((await rows(`SELECT 1 FROM public.ai_project_usage WHERE tier NOT IN ('rapide', 'documents')`)).length === 0
  && (await err(`INSERT INTO public.ai_project_usage VALUES (current_date, 'pro', 1)`)) === '23514', 'niveaux limités à rapide / documents (contrainte)');

// ═══ Les limites de l'appelant sont bornées EN BASE, par côté ═══════════════
section('Appel direct à la fonction avec des limites énormes : rien de gagné (bureau 200, salarié 50, bulletin 100)');
{
  const HUGE = 100000;
  const glob = (tier) => n(`SELECT requests AS n FROM public.ai_project_usage WHERE tier = '${tier}'`);
  // Remise à zéro DU BANC des quotas de CETTE section, puis le contrôle repart de zéro (les appels, eux, restent surveillés).
  await root();
  await db.exec(`DELETE FROM public.worker_assistant_usage WHERE user_id = '${SAM}'`);
  await db.exec(`DELETE FROM public.assistant_usage WHERE company_id = '${CO2}'`);
  await db.exec(`DELETE FROM public.ai_bulletin_usage WHERE company_id = '${CO}'`);
  await db.exec(`DELETE FROM public.zz_controle`);
  const loop = async (side, tier, max, times) => {
    let accepted = 0, first = null, last = null;
    for (let i = 0; i < times; i++) { last = await ctx(side, HUGE, tier, HUGE); if (last.ok) { accepted++; first ??= last; } }
    return { accepted, first, last };
  };
  // Salarié : 50 au plus par personne et par jour, même avec une limite de 100000.
  const gR = await glob('rapide'), gD = await glob('documents');
  await as(SAM);
  const sal = await loop('salarie', 'rapide', 50, 80);
  check(sal.accepted === 50 && sal.first.remaining === 49 && sal.last.ok === false && sal.last.raison === 'quota' && sal.last.limite === 50,
    `salarié : limite 100000 bornée à 50 en base (${sal.accepted} demandes acceptées en 80 appels directs)`);
  await root();
  check((await glob('rapide')) - gR === 50, 'salarié : le compteur global avance de 50 AU PLUS (son quota), pas un de plus après les refus');
  // Bureau : 200 au plus par entreprise et par jour.
  await as(ADMIN2);
  const bur = await loop('bureau', 'rapide', 200, 260);
  check(bur.accepted === 200 && bur.first.remaining === 199 && bur.last.ok === false && bur.last.raison === 'quota' && bur.last.limite === 200,
    `bureau : limite 100000 bornée à 200 en base (${bur.accepted} demandes acceptées en 260 appels directs)`);
  await root();
  check((await glob('rapide')) - gR === 250, 'bureau : le compteur global avance de 200 AU PLUS par entreprise (250 au total avec le salarié ci-dessus)');
  // Bulletin : 100 au plus par entreprise et par jour.
  await as(ADMIN);
  const bul = await loop('bulletin', 'documents', 100, 140);
  check(bul.accepted === 100 && bul.first.remaining === 99 && bul.last.ok === false && bul.last.raison === 'quota' && bul.last.limite === 100,
    `bulletin : limite 100000 bornée à 100 en base (${bul.accepted} lectures acceptées en 140 appels directs)`);
  await root();
  check((await glob('documents')) - gD === 100, 'bulletin : le compteur global « documents » avance de 100 AU PLUS');
  check((await n(`SELECT reads AS n FROM public.ai_bulletin_usage WHERE company_id = '${CO}'`)) === 100, 'bulletin : le quota de l’entreprise s’arrête à 100');
  // Les défauts des fonctions Edge (50 / 20 / 100) restent sous ces maxima : l'usage normal n'est jamais rogné.
  const dflt = (f, name) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(fs.readFileSync(path.join(here, '..', 'functions', f), 'utf8'))?.[1]);
  const [dB, dS, dP] = [dflt('_shared/assistant-core.ts', 'DEFAULT_DAILY_LIMIT'), dflt('_shared/worker-assistant-core.ts', 'DEFAULT_WORKER_DAILY_LIMIT'), dflt('payslip-read/index.ts', 'DEFAULT_DAILY_LIMIT')];
  check(dB > 0 && dS > 0 && dP > 0 && dB <= 200 && dS <= 50 && dP <= 100, `défauts des fonctions Edge lus dans le code (${dB} bureau, ${dS} salarié, ${dP} bulletin) ≤ maxima en base (200 / 50 / 100)`);
  // Limite négative : bornée à 0, refusée.
  await as(ADMIN2);
  check((await ctx('bureau', -5)).raison === 'quota', 'quota négatif : borné à 0, refusé');
  // Plafond global énorme ou négatif : borné à [0 ; 100 000].
  await root();
  await db.exec(`UPDATE public.ai_project_usage SET requests = 100000 WHERE tier = 'rapide'`);
  await as(ADMIN);
  const p1 = await ctx('bureau', 50, 'rapide', 2147483647);
  check(p1.ok === false && p1.raison === 'pause', 'plafond global énorme passé en direct : borné à 100 000, donc « pause » quand même');
  const p2 = await ctx('bureau', 50, 'documents', -5);
  check(p2.ok === false && p2.raison === 'pause', 'plafond négatif : borné à 0, « pause »');
  await root();
  await db.exec(`UPDATE public.ai_project_usage SET requests = ${gR + 250} WHERE tier = 'rapide'`);
  await db.exec(`UPDATE public.assistant_usage SET questions = 1 WHERE company_id = '${CO2}'`);
  await db.exec(`UPDATE public.ai_bulletin_usage SET reads = 2 WHERE company_id = '${CO}'`);
}

// ═══ Droits ════════════════════════════════════════════════════════════════
section('Droits : anonyme, accès direct, anciennes fonctions');
await as('', 'anon');
check((await err(`SELECT public.assistant_context('bureau', 50)`)) === '42501', 'anon : EXECUTE refusé');
check((await err(`SELECT * FROM public.ai_project_usage`)) === '42501', 'anon : compteur global illisible');
check((await err(`SELECT * FROM public.ai_bulletin_usage`)) === '42501', 'anon : compteur de bulletins illisible');
await as(ADMIN);
check((await err(`SELECT * FROM public.ai_project_usage`)) === '42501', 'bureau : compteur global illisible en direct');
check((await err(`SELECT * FROM public.ai_bulletin_usage`)) === '42501', 'bureau : compteur de bulletins illisible en direct');
check((await err(`INSERT INTO public.ai_project_usage VALUES ('2000-01-01', 'rapide', 0)`)) === '42501', 'bureau : ne crée pas de ligne de compteur');
check((await err(`UPDATE public.ai_project_usage SET requests = 0`)) === '42501', 'bureau : ne remet pas le compteur à zéro');
check((await err(`UPDATE public.ai_bulletin_usage SET reads = 0`)) === '42501', 'bureau : ne remet pas le quota de bulletins à zéro');
check((await err(`DELETE FROM public.ai_project_usage`)) === '42501', 'bureau : n’efface rien');
check((await err(`DELETE FROM public.ai_bulletin_usage`)) === '42501', 'bureau : n’efface aucun quota de bulletins');
check((await err(`SELECT * FROM public.assistant_usage`)) === '42501', 'quota du lot 3 : toujours illisible côté client');
check((await err(`SELECT public.assistant_consume($1, 1000)`, [CO])) === '42501', 'assistant_consume : toujours réservée à la clé de service');
check((await err(`SELECT public.worker_assistant_consume($1, 1000)`, [SAM])) === '42501', 'worker_assistant_consume : toujours réservée à la clé de service');
await as(null, 'service_role');
check((await err(`DELETE FROM public.ai_project_usage`)) === '42501' && (await err(`DELETE FROM public.ai_bulletin_usage`)) === '42501', 'clé de service : pas de DELETE non plus sur les compteurs (aucun droit DELETE)');
check((await err(`TRUNCATE public.ai_project_usage`)) === '42501', 'clé de service : pas de TRUNCATE non plus');
check(!(await err(`SELECT * FROM public.ai_project_usage`)) && !(await err(`SELECT * FROM public.ai_bulletin_usage`)), 'clé de service : lit les compteurs (pour un futur suivi)');
check((await err(`SELECT public.assistant_context('bureau', 50)`)) === '42501', 'clé de service : pas d’EXECUTE sur assistant_context (elle n’est pas faite pour elle)');
await root();
check(!!(await one(`SELECT 1 AS ok FROM pg_proc p WHERE p.oid = 'public.assistant_context(text, integer, text, integer)'::regprocedure
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)`)),
  'droits de la fonction : authenticated seul peut l’exécuter (ni anon, ni service_role, ni PUBLIC)');
check((await n(`SELECT count(*) AS n FROM pg_proc WHERE oid = 'public.assistant_context(text, integer, text, integer)'::regprocedure AND prosecdef AND proconfig @> ARRAY['search_path=""']`)) === 1,
  'fonction SECURITY DEFINER avec search_path vide');
check((await n(`SELECT count(*) AS n FROM pg_class WHERE relname IN ('ai_project_usage', 'ai_bulletin_usage') AND relrowsecurity`)) === 2
  && (await n(`SELECT count(*) AS n FROM pg_policies WHERE tablename IN ('ai_project_usage', 'ai_bulletin_usage')`)) === 0, 'RLS activée sur les deux compteurs, aucune policy');

// ═══ Contrôle automatique ══════════════════════════════════════════════════
section('Contrôle automatique : aucun DROP ni DELETE exécuté');
await root();
{
  const c = await controle();
  check(c.length === 0, `aucun DELETE exécuté par la fonction pendant les appels${c.length ? ` (${c.join(' ; ')})` : ''}`);
  await db.exec(`DELETE FROM public.zz_controle`);
  await db.exec(SQL);
  const c2 = await controle();
  check(c2.length === 0, `rechargement de la migration : aucun DROP ni DELETE exécuté${eventTrigger ? ' (déclencheur d’événement sql_drop actif)' : ' (sql_drop indisponible ici : contrôle par lecture du fichier)'}${c2.length ? ` (${c2.join(' ; ')})` : ''}`);
  const body = (await one(`SELECT pg_get_functiondef('public.assistant_context(text, integer, text, integer)'::regprocedure) AS d`)).d;
  check(!/\b(DELETE|DROP|TRUNCATE)\b/i.test(body), 'corps de la fonction : ni DELETE, ni DROP, ni TRUNCATE');
}

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (en-tête, tel quel), puis la migration se rejoue');
await root();
await db.exec(`DELETE FROM public.zz_controle`);
const gBefore = JSON.stringify(await rows(`SELECT * FROM public.ai_project_usage ORDER BY tier`));
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière se rejoue sans erreur${e ? ` (${e})` : ''}`); }
if (eventTrigger) {
  const c = await controle();
  check(c.length === 1 && /^DROP function public\.assistant_context/.test(c[0]), `retour arrière : seul DROP exécuté = la fonction neuve (${c.join(' ; ')})`);
}
await as(ADMIN);
check((await err(`SELECT public.assistant_context('bureau', 50)`)) === '42883', 'fonction retirée (42883, comme avant le lot 6)');
await root();
check(JSON.stringify(await rows(`SELECT * FROM public.ai_project_usage ORDER BY tier`)) === gBefore, 'compteur global gardé tel quel (rien n’est effacé)');
{
  const back = await prints();
  check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.con === before.con && back.priv === before.priv && back.rls === before.rls,
    'après retour arrière : fonctions, policies, triggers, colonnes, contraintes, droits et RLS existants identiques à avant le lot 6');
}
await as(null, 'service_role');
check((await one(`SELECT public.assistant_consume($1, 50) AS n`, [CO])).n >= 1, 'après retour arrière : assistant_consume marche toujours (anciennes fonctions Edge)');
await root();
check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
{
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification d’en-tête : de nouveau 8 × true');
  check(JSON.stringify(await rows(`SELECT * FROM public.ai_project_usage ORDER BY tier`)) === gBefore, 'rechargée : le compteur du jour est retrouvé');
  await as(ALEX);
  check((await ctx('salarie', 20)).ok === true, 'rechargée : assistant_context répond de nouveau');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
