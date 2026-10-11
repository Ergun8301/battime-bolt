// Lot 9 — tâches avec heure de début et de fin. Rejoué POUR DE VRAI sur un
// Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:taches-heures-db
//
// État de la production : le bouchon des lots 2, 11, 12 et 14 (fonctions et
// policies recopiées mot pour mot), les droits PAR DÉFAUT de production (tout
// pour anon / authenticated sur les objets neufs), puis le lot 4 TEL QUEL et
// quelques tâches déjà là. Le fichier du lot 9 est chargé TEL QUEL, deux fois ;
// la vérification de son en-tête doit renvoyer 6 × true ; son RETOUR ARRIÈRE
// (en-tête) est exécuté (il sauvegarde d'abord les heures), puis le fichier est
// rechargé et « Remettre les heures » les rend à leurs tâches.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const SQL4 = mig('20261010170000_lot4_missions_reunions.sql');
const SQL = mig('20261011130000_lot9_taches_avec_heures.sql');
const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';
let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}
const lot11 = fs.readFileSync(path.join(here, 'lot11_cloture_salarie.mjs'), 'utf8');
const STUB = lot11.slice(lot11.indexOf('const STUB = `') + 'const STUB = `'.length, lot11.indexOf('`;', lot11.indexOf('const STUB = `')));

const CO = 'c0000000-0000-0000-0000-000000000001';
const CO2 = 'c0000000-0000-0000-0000-000000000002';
const ADMIN = 'a0000000-0000-0000-0000-00000000000a';
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b'; // bureau d'une AUTRE entreprise
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const AUTRE = '70000000-0000-0000-0000-000000000007'; // salarié de l'autre entreprise
const D = '2026-10-15';

const EXTRA = `
CREATE TABLE public.planning (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, work_date date, worksite_id uuid, absence_type text);
GRANT ALL ON public.planning TO service_role;
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'),
  ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Test'),
  ('${AUTRE}', '${CO2}', 'worker', true, 'Autre', 'Salarié');
-- La policy de PRODUCTION sur users (la policy d'insertion des tâches la lit).
GRANT SELECT ON public.users TO authenticated;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_company ON public.users FOR SELECT TO authenticated USING ((company_id = get_my_company_id()) OR (id = auth.uid()));
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);
const db = new PGlite();
await db.exec(STUB);
await db.exec(EXTRA);
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
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
const hhmm = (t) => (t == null ? null : String(t).slice(0, 5));

// La vérification du lot 4 (bloc commenté de SON fichier) : elle doit rester vraie.
const lot4Lines = SQL4.split('\n');
const v4Start = lot4Lines.findIndex((l) => /^-- VÉRIFICATION APRÈS APPLICATION/.test(l));
const v4 = [];
for (let i = v4Start + 1; i < lot4Lines.length; i++) {
  const l = lot4Lines[i];
  if (!v4.length && !/^-- SELECT\b/.test(l)) continue;
  v4.push(l.slice(3));
  if (/;\s*$/.test(l)) break;
}
const POST4 = v4.join('\n');

// L'en-tête du lot 9 : RETOUR ARRIÈRE, VÉRIFICATION, HISTORIQUE (lignes « --   … »).
const header = SQL.slice(0, SQL.indexOf('-- ─────'));
const block = (from, to) => header.slice(header.indexOf(from), header.indexOf(to)).split('\n').slice(1)
  .filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n').trim();
const ROLLBACK_SQL = block('-- RETOUR ARRIÈRE', '-- REMETTRE LES HEURES');
const RESTORE_SQL = block('-- REMETTRE LES HEURES', '-- VÉRIFICATION');
const BACKUP = 'day_tasks_heures_lot9_sauvegarde'; // créée par le retour arrière seulement
const POST_SQL = block('-- VÉRIFICATION', '-- HISTORIQUE');
const HISTO_SQL = header.slice(header.indexOf('-- HISTORIQUE')).split('\n').slice(1).filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n').trim();

// ═══ Avant : des tâches du lot 4 existent déjà ═════════════════════════════
section('Avant le lot 9 : tâches du lot 4 en place');
await as(ADMIN);
const old1 = await one(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, part) VALUES ($1, $2, $3, 'Ranger le dépôt', 'matin') RETURNING id`, [CO, SAM, D]);
await one(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'Appeler le client') RETURNING id`, [CO, CHEF, D]);
await as(SAM);
await one(`SELECT * FROM public.set_day_task_done($1, true)`, [old1.id]);
await root();
const oldRows = JSON.stringify(await rows(`SELECT id, company_id, user_id, work_date, text, part, created_by, created_at, done_at, done_by FROM public.day_tasks ORDER BY id`));
check((await rows(`SELECT 1 FROM public.day_tasks`)).length === 2, '2 tâches existantes (dont une cochée « Fait »)');
check((await err(`SELECT start_time FROM public.day_tasks`)) === '42703', 'sans le lot 9, lire start_time répond « colonne absente » (42703) : ce que l’appli détecte');

// ═══ La migration : additive, rejouable ════════════════════════════════════
section('Migration : additive, rejouable, en-tête complet');
const NEW_COLS = ['start_time', 'end_time'];
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace`)).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s
  FROM pg_policies`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> $2 AND NOT (table_name = 'day_tasks' AND column_name = ANY($1))`, [NEW_COLS, BACKUP])).s;
const conPrint = async () => (await one(`SELECT string_agg(conrelid::regclass::text || '.' || conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY 1) AS s
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname <> 'day_tasks_times_check' AND conrelid IS DISTINCT FROM to_regclass('public.${BACKUP}')`)).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname,
    has_table_privilege(r.rolname, c.oid, 'SELECT') AS s, has_table_privilege(r.rolname, c.oid, 'INSERT') AS i,
    has_table_privilege(r.rolname, c.oid, 'UPDATE') AS u, has_table_privilege(r.rolname, c.oid, 'DELETE') AS d
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname <> '${BACKUP}' ORDER BY 1, 2`));
const colPrivPrint = async () => JSON.stringify(await rows(`SELECT column_name AS c, r.rolname,
    has_column_privilege(r.rolname, 'public.day_tasks', column_name, 'INSERT') AS i, has_column_privilege(r.rolname, 'public.day_tasks', column_name, 'UPDATE') AS u
  FROM information_schema.columns CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE table_schema = 'public' AND table_name = 'day_tasks' AND NOT (column_name = ANY($1)) ORDER BY 1, 2`, [NEW_COLS]));
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(), priv: await privPrint(), cpriv: await colPrivPrint() });
const before = await prints();

const code = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
check(!/\b(DROP|DELETE|RENAME|TRUNCATE|UPDATE)\b|\bALTER\s+(COLUMN|POLICY|FUNCTION)\b/i.test(code),
  'migration additive : ni DROP, ni DELETE, ni RENAME, ni UPDATE, ni ALTER COLUMN / POLICY / FUNCTION hors commentaires');
check(!/\bREVOKE\b/i.test(code), 'aucun droit retiré (pas de REVOKE)');
check((code.match(/\bALTER TABLE public\.(\w+)/g) || []).every((x) => x.endsWith('day_tasks')), 'seule day_tasks est touchée');
check(!!ROLLBACK_SQL && !!RESTORE_SQL && !!POST_SQL && /INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\s+VALUES \('20261011130000', 'lot9_taches_avec_heures'\) ON CONFLICT DO NOTHING;/.test(HISTO_SQL),
  'en-tête : RETOUR ARRIÈRE, VÉRIFICATION et HISTORIQUE (même nom que le fichier)');
check((ROLLBACK_SQL.match(/\bDROP\b/g) || []).length === 3 && !/\bDROP\b/.test(RESTORE_SQL + POST_SQL + HISTO_SQL + code) && !/\bDELETE\b/.test(ROLLBACK_SQL + RESTORE_SQL + POST_SQL + HISTO_SQL + code),
  'DROP seulement dans le retour arrière (3 fois), aucun DELETE nulle part en SQL');

await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
check(Number((await one(`SELECT count(*) AS n FROM pg_constraint WHERE conname = 'day_tasks_times_check'`)).n) === 1, 'la contrainte n’est posée qu’une fois');
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (set_day_task_done, get_my_company_id, is_admin…)');
check(before.pol === after.pol, 'policies existantes inchangées (day_tasks : les 3 du lot 4)');
check(before.trg === after.trg, 'triggers existants inchangés, aucun trigger ajouté');
check(before.col === after.col, 'aucune autre colonne ajoutée ni modifiée');
check(before.con === after.con, 'contraintes existantes inchangées');
check(before.priv === after.priv, 'droits des tables inchangés (anon, authenticated)');
check(before.cpriv === after.cpriv, 'droits par colonne existants de day_tasks inchangés (rien de retiré, rien d’autre d’ajouté)');
await root();
check(JSON.stringify(await rows(`SELECT id, company_id, user_id, work_date, text, part, created_by, created_at, done_at, done_by FROM public.day_tasks ORDER BY id`)) === oldRows,
  'tâches existantes intactes (texte, moment, « Fait »)');
check((await rows(`SELECT 1 FROM public.day_tasks WHERE start_time IS NOT NULL OR end_time IS NOT NULL`)).length === 0, 'tâches existantes : sans heures (NULL)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 6 && bad.length === 0, `vérification d’en-tête : 6 × true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}
{
  const v = await one(POST4);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 10 && bad.length === 0, `vérification du lot 4 : toujours 10 × true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}
{
  const cols = await rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'day_tasks'
    AND has_column_privilege('authenticated', 'public.day_tasks', column_name, 'INSERT') ORDER BY ordinal_position`);
  check(cols.map((x) => x.c).join(',') === 'company_id,user_id,work_date,text,part,start_time,end_time',
    `insertion permise : les 5 colonnes du lot 4 + start_time, end_time (${cols.map((x) => x.c).join(',')})`);
  const upd = await rows(`SELECT column_name AS c, r FROM information_schema.columns, unnest(ARRAY['anon','authenticated']) r
    WHERE table_schema = 'public' AND table_name = 'day_tasks' AND has_column_privilege(r, 'public.day_tasks', column_name, 'UPDATE')`);
  check(upd.length === 0, 'toujours aucun droit UPDATE, sur aucune colonne');
  const tpl = await rows(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_templates' AND column_name IN ('start_time', 'end_time')`);
  check(tpl.length === 0, 'tâches habituelles : sans heures');
}

// ═══ La contrainte ═════════════════════════════════════════════════════════
section('Contrainte : les deux heures ou aucune, la fin après le début');
await as(ADMIN);
const ins = (start, end, text = 'Tâche', who = SAM) => one(
  `INSERT INTO public.day_tasks (company_id, user_id, work_date, text, part, start_time, end_time) VALUES ($1, $2, $3, $4, 'matin', $5, $6) RETURNING *`,
  [CO, who, D, text, start, end]);
const insErr = (start, end) => err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, start_time, end_time) VALUES ($1, $2, $3, 'x', $4, $5)`, [CO, SAM, D, start, end]);
const T = await ins('10:00', '11:30', 'Préparer la commande');
check(hhmm(T.start_time) === '10:00' && hhmm(T.end_time) === '11:30' && T.created_by === ADMIN, 'bureau : tâche 10:00–11:30 ajoutée (created_by = l’auteur par défaut)');
check(!!(await ins(null, null, 'Sans heure')), 'bureau : tâche sans heure (comme au lot 4)');
check(!(await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'Colonnes du lot 4 seulement')`, [CO, ALEX, D])),
  'bureau : insertion avec les seules colonnes du lot 4 (l’appli d’avant) toujours acceptée');
check((await insErr('10:00', null)) === '23514', 'refus : début sans fin');
check((await insErr(null, '11:00')) === '23514', 'refus : fin sans début');
check((await insErr('11:00', '11:00')) === '23514', 'refus : fin = début');
check((await insErr('17:00', '08:00')) === '23514', 'refus : fin avant le début (pas de tâche de nuit)');
check((await insErr('25:00', '26:00')) === '22008', 'refus : heure impossible');
check(!!(await ins('07:00', '23:59', 'Toute la journée', CHEF)), 'chef d’équipe : tâche 07:00–23:59 acceptée');

// ═══ Droits ════════════════════════════════════════════════════════════════
section('Droits : salarié, bureau, autre entreprise, anonyme');
await as(ADMIN);
check((await err(`UPDATE public.day_tasks SET start_time = '09:00', end_time = '10:00' WHERE id = $1`, [T.id])) === '42501', 'bureau : ne modifie pas les heures (on retire et on remet)');
check((await rows(`SELECT id FROM public.day_tasks WHERE start_time IS NOT NULL`)).length === 2, 'bureau : lit les heures de son entreprise');
await as(SAM);
{
  const mine = await rows(`SELECT text, start_time, end_time FROM public.day_tasks ORDER BY start_time NULLS LAST, text`);
  check(mine.length === 3 && hhmm(mine[0].start_time) === '10:00' && hhmm(mine[0].end_time) === '11:30', 'Sam lit SES tâches avec leurs heures (10:00–11:30 d’abord)');
}
check((await err(`UPDATE public.day_tasks SET start_time = '08:00', end_time = '09:00' WHERE id = $1`, [T.id])) === '42501', 'Sam ne modifie pas les heures');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, start_time, end_time) VALUES ($1, $2, $3, 'à moi', '08:00', '09:00')`, [CO, SAM, D])) === '42501', 'Sam n’ajoute pas de tâche, même avec des heures');
check((await rows(`DELETE FROM public.day_tasks RETURNING id`)).length === 0, 'Sam n’efface rien');
{
  const r = await one(`SELECT * FROM public.set_day_task_done($1, true)`, [T.id]);
  check(!!r.done_at && hhmm(r.start_time) === '10:00' && hhmm(r.end_time) === '11:30' && r.text === 'Préparer la commande', 'Sam coche « Fait » : set_day_task_done rend la ligne AVEC ses heures, inchangées');
  const r2 = await one(`SELECT * FROM public.set_day_task_done($1, false)`, [T.id]);
  check(r2.done_at === null && hhmm(r2.start_time) === '10:00', 'décocher : les heures restent');
}
await as(ALEX);
check((await rows(`SELECT id FROM public.day_tasks WHERE start_time IS NOT NULL`)).length === 0, 'Alex ne voit pas les tâches (ni les heures) de Sam');
check((await err(`SELECT * FROM public.set_day_task_done($1, true)`, [T.id])) === 'P0002', 'Alex ne coche pas la tâche de Sam');
await as(ADMIN2);
check((await rows(`SELECT * FROM public.day_tasks`)).length === 0, 'autre entreprise : 0 tâche lue');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, start_time, end_time) VALUES ($1, $2, $3, 'x', '08:00', '09:00')`, [CO, SAM, D])) === '42501', 'autre entreprise : n’ajoute pas chez nous');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, start_time, end_time) VALUES ($1, $2, $3, 'x', '08:00', '09:00')`, [CO2, SAM, D])) === '42501', 'autre entreprise : pas de tâche à notre salarié sous son entreprise');
check((await err(`UPDATE public.day_tasks SET start_time = '08:00'`)) === '42501', 'autre entreprise : ne modifie rien');
check((await rows(`DELETE FROM public.day_tasks RETURNING id`)).length === 0, 'autre entreprise : n’efface rien');
check(!(await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, start_time, end_time) VALUES ($1, $2, $3, 'Chez eux', '08:00', '09:00')`, [CO2, AUTRE, D])),
  'autre entreprise : ajoute chez ELLE, avec heures');
await as(ADMIN);
check((await rows(`SELECT id FROM public.day_tasks WHERE company_id = $1`, [CO2])).length === 0, 'notre bureau ne lit pas la tâche de l’autre entreprise');
await as('', 'anon');
check((await err(`SELECT start_time FROM public.day_tasks`)) === '42501', 'anon : lecture refusée');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, start_time, end_time) VALUES ($1, $2, $3, 'x', '08:00', '09:00')`, [CO, SAM, D])) === '42501', 'anon : insertion refusée');

// ═══ La vérification reste vraie plus tard ══════════════════════════════════
section('Vérification d’en-tête : toujours vraie une fois des heures saisies');
await root();
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 6 && bad.length === 0, `avec ${(await rows(`SELECT 1 FROM public.day_tasks WHERE start_time IS NOT NULL`)).length} tâches à heures : toujours 6 × true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
  await db.exec(`CREATE POLICY day_tasks_essai_lot_suivant ON public.day_tasks FOR SELECT TO authenticated USING (false)`);
  const v2 = await one(POST_SQL);
  check(Object.values(v2).every((x) => x === true), 'une policy de plus sur day_tasks (un lot suivant) : toujours 6 × true (policies contrôlées par leur nom)');
  await db.exec(`DROP POLICY day_tasks_essai_lot_suivant ON public.day_tasks`);
}

// ═══ Jamais des heures ═════════════════════════════════════════════════════
section('Jamais des heures, jamais du planning');
await root();
check(Number((await one(`SELECT count(*) AS n FROM public.time_entries`)).n) === 0 && Number((await one(`SELECT count(*) AS n FROM public.planning`)).n) === 0
  && Number((await one(`SELECT count(*) AS n FROM public.active_sessions`)).n) === 0, 'aucune heure, aucun planning, aucun chrono écrit par les tâches avec heures');

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (en-tête, tel quel), puis la migration se rejoue');
await root();
const nTasks = Number((await one(`SELECT count(*) AS n FROM public.day_tasks`)).n);
const doneBefore = Number((await one(`SELECT count(*) AS n FROM public.day_tasks WHERE done_at IS NOT NULL`)).n);
const timedBefore = JSON.stringify(await rows(`SELECT id, start_time, end_time FROM public.day_tasks WHERE start_time IS NOT NULL ORDER BY id`));
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière se rejoue sans erreur${e ? ` (${e})` : ''}`); }
check((await err(`SELECT start_time FROM public.day_tasks`)) === '42703', 'colonnes retirées (42703, comme avant le lot 9)');
{
  const saved = JSON.stringify(await rows(`SELECT id, start_time, end_time FROM public.${BACKUP} ORDER BY id`));
  check(saved === timedBefore && JSON.parse(saved).length === 3, `heures déjà saisies recopiées avant le retrait (${JSON.parse(saved).length} tâches, rejouer ne les perd pas) : rien ne disparaît sans trace`);
  const rls = await one(`SELECT relrowsecurity AS r FROM pg_class WHERE oid = 'public.${BACKUP}'::regclass`);
  const priv = await one(`SELECT has_table_privilege('anon', 'public.${BACKUP}', 'SELECT') OR has_table_privilege('authenticated', 'public.${BACKUP}', 'SELECT')
    OR has_table_privilege('authenticated', 'public.${BACKUP}', 'INSERT') OR has_table_privilege('anon', 'public.${BACKUP}', 'DELETE') AS any`);
  check(rls.r === true && priv.any === false, 'sauvegarde fermée : RLS active, aucun droit pour anon ni authenticated (malgré les droits par défaut)');
  await as(ADMIN);
  check((await err(`SELECT * FROM public.${BACKUP}`)) === '42501', 'le bureau ne lit pas la sauvegarde depuis l’appli');
  await root();
}
check(Number((await one(`SELECT count(*) AS n FROM public.day_tasks`)).n) === nTasks && Number((await one(`SELECT count(*) AS n FROM public.day_tasks WHERE done_at IS NOT NULL`)).n) === doneBefore,
  `les tâches et leur « Fait » restent (${nTasks} tâches)`);
const back = await prints();
check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.con === before.con && back.priv === before.priv && back.cpriv === before.cpriv,
  'après retour arrière : fonctions, policies, triggers, colonnes, contraintes et droits identiques à avant le lot 9');
{
  const v = await one(POST4);
  check(Object.values(v).every((x) => x === true), 'vérification du lot 4 : toujours toute à true après le retour arrière');
}
await as(SAM);
check(!(await err(`SELECT * FROM public.set_day_task_done($1, true)`, [T.id])), 'après retour arrière : le salarié coche toujours (set_day_task_done marche)');
await as(ADMIN);
check(!(await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, part) VALUES ($1, $2, $3, 'Comme au lot 4', 'soir')`, [CO, SAM, D])), 'après retour arrière : le bureau ajoute comme au lot 4');
await root();
check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
{
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification d’en-tête : de nouveau 6 × true');
}
{
  const e = await errExec(RESTORE_SQL);
  check(!e, `« Remettre les heures » (en-tête, tel quel) s’exécute${e ? ` (${e})` : ''}`);
  const now = JSON.stringify(await rows(`SELECT id, start_time, end_time FROM public.day_tasks WHERE start_time IS NOT NULL ORDER BY id`));
  check(now === timedBefore, 'les heures sauvegardées sont revenues sur leurs tâches');
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification d’en-tête : 6 × true avec les heures revenues');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
