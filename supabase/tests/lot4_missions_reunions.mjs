// Lot 4 — missions (tâches du jour) et réunions. Rejoué POUR DE VRAI sur un
// Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:missions-db
//
// Même bouchon que les lots 2, 11, 12 et 14 (fonctions et policies de
// PRODUCTION recopiées mot pour mot), plus la policy de production sur `users`
// (la policy d'insertion des tâches la lit) et les droits PAR DÉFAUT de
// production (tout pour anon / authenticated sur les objets neufs) — pour
// prouver que la migration les reprend bien. La migration est chargée TELLE
// QUELLE, deux fois ; puis son RETOUR ARRIÈRE (décommenté) est exécuté, et elle
// est rechargée.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(here, '..', 'migrations', '20261010170000_lot4_missions_reunions.sql'), 'utf8');
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
const EXADMIN = 'a0000000-0000-0000-0000-00000000000c'; // bureau archivé
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const NINA = '40000000-0000-0000-0000-000000000004'; // salariée que l'on supprimera
const ANCIEN = '60000000-0000-0000-0000-000000000006'; // salarié archivé
const AUTRE = '70000000-0000-0000-0000-000000000007'; // salarié de l'autre entreprise
const D = '2026-10-15';

const EXTRA = `
CREATE TABLE public.planning (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, work_date date, worksite_id uuid, absence_type text);
GRANT ALL ON public.planning TO service_role;
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${EXADMIN}', '${CO}', 'admin', false, 'Ex', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'),
  ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Test'),
  ('${NINA}', '${CO}', 'worker', true, 'Nina', 'Test'),
  ('${ANCIEN}', '${CO}', 'worker', false, 'Ancien', 'Test'),
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
const count = async (sql, p = []) => Number((await one(sql, p)).n);

/** Les lignes SQL commentées du fichier entre deux repères (comme le test du lot 7). */
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
    else return null;
    if (!endRe && /;\s*$/.test(l)) return out.join('\n');
  }
  return null;
}
const POST_SQL = commentedBlock(/^-- VÉRIFICATION APRÈS APPLICATION/);
const ROLLBACK_SQL = commentedBlock(/^-- ── DÉBUT DU RETOUR ARRIÈRE ──$/, /^-- ── FIN DU RETOUR ARRIÈRE ──$/);
const NEW_TABLES = ['task_templates', 'day_tasks', 'meetings', 'meeting_participants'];
const NEW_FNS = ['set_day_task_done', 'office_save_meeting', 'office_delete_meeting'];

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
section('Migration : additive, rejouable, droits repris malgré les droits par défaut');
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND NOT (proname = ANY($1))`, [NEW_FNS])).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s
  FROM pg_policies WHERE NOT (tablename = ANY($1))`, [NEW_TABLES])).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND NOT (table_name = ANY($1))`, [NEW_TABLES])).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT (c.relname = ANY($1)) ORDER BY 1, 2`, [NEW_TABLES]));
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), priv: await privPrint() });
const before = await prints();
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (get_my_company_id, is_admin, gardes des heures…)');
check(before.pol === after.pol, 'policies existantes inchangées (users, time_entries…)');
check(before.trg === after.trg, 'triggers existants inchangés, aucun trigger ajouté');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée sur les tables existantes');
check(before.priv === after.priv, 'droits des tables existantes inchangés');
check(!/\b(DROP\s+(TABLE|COLUMN|FUNCTION)|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|DELETE\s+FROM\s+public\.(?!meeting_participants\s+mp\b|meetings\s+m\b))/i.test(SQL.split('-- RETOUR ARRIÈRE')[0]),
  'migration additive : aucun DROP / RENAME / ALTER d’objet existant (hors retour arrière)');
check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 10 && bad.length === 0, `vérification après application : 10 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}
{
  const pols = await rows(`SELECT tablename, string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) AS s FROM pg_policies WHERE tablename = ANY($1) GROUP BY 1 ORDER BY 1`, [NEW_TABLES]);
  const by = Object.fromEntries(pols.map((r) => [r.tablename, r.s]));
  check(by.day_tasks === 'day_tasks_admin_delete:DELETE,day_tasks_admin_insert:INSERT,day_tasks_select:SELECT', `day_tasks : 3 policies, aucune UPDATE (${by.day_tasks})`);
  check(by.meetings === 'meetings_select:SELECT' && by.meeting_participants === 'meeting_participants_select:SELECT', 'réunions : lecture seule (écrites par les fonctions)');
  check(!Object.values(by).join(',').includes('support'), 'pas de policy « support_read » : lecture limitée à l’entreprise');
}
{
  const r = await rows(`SELECT t, p, role FROM unnest($1::text[]) t, unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER','UPDATE']) p, unnest(ARRAY['authenticated','anon']) role
    WHERE has_table_privilege(role, 'public.' || t, p)`, [NEW_TABLES]);
  check(r.length === 0, `ni TRUNCATE, ni REFERENCES, ni TRIGGER, ni UPDATE pour anon / authenticated sur les 4 tables (${r.map((x) => `${x.role}:${x.t}:${x.p}`).join(' ') || 'aucun'})`);
  const anon = await rows(`SELECT t FROM unnest($1::text[]) t WHERE has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,DELETE')`, [NEW_TABLES]);
  check(anon.length === 0, 'anon : aucun droit sur les 4 tables');
  const cols = await rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'day_tasks'
    AND has_column_privilege('authenticated', 'public.day_tasks', column_name, 'INSERT') ORDER BY ordinal_position`);
  check(cols.map((x) => x.c).join(',') === 'company_id,user_id,work_date,text,part', `day_tasks : insertion permise sur company_id, user_id, work_date, text, part seulement (${cols.map((x) => x.c).join(',')})`);
  const fns = await one(`SELECT bool_and(prosecdef) AS d, bool_and(array_to_string(proconfig, ',') = 'search_path=""') AS s,
    bool_or(has_function_privilege('anon', oid, 'EXECUTE')) AS a, bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) AS u
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [NEW_FNS]);
  check(fns.d && fns.s && !fns.a && fns.u, 'fonctions : SECURITY DEFINER, search_path vide, anon exclu, authenticated autorisé');
}

// ═══ Tâches du jour ════════════════════════════════════════════════════════
section('Tâches : le bureau ajoute et retire ; personne n’écrit « Fait » en direct');
await as(ADMIN);
const t1row = await one(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, part) VALUES ($1, $2, $3, 'Ranger le dépôt', 'matin') RETURNING *`, [CO, SAM, D]);
check(!!t1row?.id && t1row.created_by === ADMIN && t1row.done_at === null, 'bureau ajoute une tâche à Sam (INSERT … RETURNING, created_by = l’auteur par défaut)');
const T1 = t1row.id;
check(!(await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'Appeler le client')`, [CO, CHEF, D])), 'bureau ajoute une tâche au chef d’équipe (sans moment)');
check(!(await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'Rendre les clés')`, [CO, NINA, D])), 'bureau ajoute une tâche à Nina');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'x')`, [CO, AUTRE, D])) === '42501', 'refus : salarié d’une autre entreprise');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'x')`, [CO2, AUTRE, D])) === '42501', 'refus : company_id d’une autre entreprise');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'x')`, [CO, ANCIEN, D])) === '42501', 'refus : salarié archivé');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'x')`, [CO, ADMIN, D])) === '42501', 'refus : un compte bureau n’a pas de tâches');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, done_at) VALUES ($1, $2, $3, 'x', now())`, [CO, SAM, D])) === '42501', 'refus : done_at à l’insertion');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, created_by) VALUES ($1, $2, $3, 'x', $4)`, [CO, SAM, D, SAM])) === '42501', 'refus : created_by envoyé (ni oublié, ni falsifié)');
check((await err(`INSERT INTO public.day_tasks (id, company_id, user_id, work_date, text) VALUES (gen_random_uuid(), $1, $2, $3, 'x')`, [CO, SAM, D])) === '42501', 'refus : id envoyé par le client');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, part) VALUES ($1, $2, $3, 'x', 'nuit')`, [CO, SAM, D])) === '23514', 'refus : moment inconnu');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, '   ')`, [CO, SAM, D])) === '23514', 'refus : texte vide');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, repeat('a', 201))`, [CO, SAM, D])) === '23514', 'refus : texte de plus de 200 caractères');
check((await err(`UPDATE public.day_tasks SET done_at = now()`)) === '42501', 'bureau : ne pose pas « Fait » en direct');
check((await err(`UPDATE public.day_tasks SET text = 'Autre texte'`)) === '42501', 'bureau : ne renomme pas (pas de renommage, une tâche faite resterait « Fait »)');
check((await err(`UPDATE public.day_tasks SET user_id = $1`, [ALEX])) === '42501', 'bureau : ne change pas le salarié d’une tâche');
check((await err(`UPDATE public.day_tasks SET work_date = '2026-10-16'`)) === '42501', 'bureau : ne change pas le jour');
check((await rows(`SELECT id FROM public.day_tasks`)).length === 3, 'bureau : lit les tâches de son entreprise');

await as(ADMIN2);
check((await rows(`SELECT * FROM public.day_tasks`)).length === 0, 'autre entreprise : 0 tâche lue');
check((await rows(`DELETE FROM public.day_tasks RETURNING id`)).length === 0, 'autre entreprise : 0 tâche effacée');
check((await err(`SELECT * FROM public.set_day_task_done($1, true)`, [T1])) === 'P0002', 'autre entreprise : ne coche pas');

section('Tâches : le salarié coche « Fait » sur SES tâches, et rien d’autre');
await as(SAM);
check((await rows(`SELECT id FROM public.day_tasks`)).map((x) => x.id).join() === T1, 'Sam lit SA tâche seulement');
check((await err(`UPDATE public.day_tasks SET text = 'autre'`)) === '42501', 'Sam ne change pas le texte');
check((await err(`UPDATE public.day_tasks SET work_date = '2026-10-16'`)) === '42501', 'Sam ne change pas le jour');
check((await err(`UPDATE public.day_tasks SET user_id = $1`, [ALEX])) === '42501', 'Sam ne change pas le salarié');
check((await err(`UPDATE public.day_tasks SET done_at = now()`)) === '42501', 'Sam ne pose pas done_at en direct');
check((await rows(`DELETE FROM public.day_tasks RETURNING id`)).length === 0, 'Sam n’efface pas (0 ligne)');
check((await err(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'à moi')`, [CO, SAM, D])) === '42501', 'Sam n’ajoute pas de tâche, même à lui-même');
const r1 = await one(`SELECT * FROM public.set_day_task_done($1, true)`, [T1]);
check(!!r1.done_at && r1.done_by === SAM, 'Sam coche « Fait » (done_at, done_by = Sam)');
const r2 = await one(`SELECT * FROM public.set_day_task_done($1, true)`, [T1]);
check(String(r2.done_at) === String(r1.done_at), 'cocher deux fois garde la première heure');
check(r2.text === 'Ranger le dépôt' && String(r2.work_date) === String(t1row.work_date) && r2.user_id === SAM && r2.part === 'matin', 'cocher ne change ni le texte, ni le jour, ni le salarié, ni le moment');
const r3 = await one(`SELECT * FROM public.set_day_task_done($1, false)`, [T1]);
check(r3.done_at === null && r3.done_by === null, 'décocher efface « Fait »');
await one(`SELECT * FROM public.set_day_task_done($1, true)`, [T1]);
check((await err(`SELECT * FROM public.set_day_task_done($1, NULL)`, [T1])) === '22023', 'NULL refusé (22023)');
await as(ALEX);
check((await err(`SELECT * FROM public.set_day_task_done($1, true)`, [T1])) === 'P0002', 'Alex ne coche pas la tâche de Sam');
check((await rows(`SELECT id FROM public.day_tasks`)).length === 0, 'Alex ne voit pas les tâches de Sam');
await as(CHEF);
check((await rows(`SELECT text FROM public.day_tasks`)).map((x) => x.text).join() === 'Appeler le client', 'chef d’équipe : ses seules tâches (pas celles de l’équipe)');
await as(ADMIN);
check((await err(`SELECT * FROM public.set_day_task_done($1, false)`, [T1])) === 'P0002', 'le bureau ne coche pas à la place du salarié');
check(!!(await one(`SELECT done_at FROM public.day_tasks WHERE id = $1`, [T1])).done_at, 'le bureau voit « Fait » (done_at posé)');
await as(ANCIEN);
check((await rows(`SELECT * FROM public.day_tasks`)).length === 0, 'archivé : ne lit rien');
await as('', 'anon');
check((await err(`SELECT * FROM public.day_tasks`)) === '42501', 'anon : lecture refusée');
check((await err(`SELECT * FROM public.set_day_task_done($1, true)`, [T1])) === '42501', 'anon : fonction refusée');
await as(ADMIN);
const tx = await one(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'Tâche retirée') RETURNING id`, [CO, SAM, D]);
check((await rows(`DELETE FROM public.day_tasks WHERE id = $1 RETURNING id`, [tx.id])).length === 1, 'le bureau retire une tâche');
await as(SAM);
check((await err(`SELECT * FROM public.set_day_task_done($1, true)`, [tx.id])) === 'P0002', 'tâche retirée pendant que le salarié coche : P0002 (« retirée par le bureau »)');

section('Tâches habituelles : liste du bureau seulement');
await as(ADMIN);
const tpl = await one(`INSERT INTO public.task_templates (company_id, text) VALUES ($1, 'Ranger le dépôt') RETURNING *`, [CO]);
check(!!tpl.id && tpl.created_by === ADMIN, 'tâche habituelle ajoutée (created_by = l’auteur par défaut)');
check((await err(`INSERT INTO public.task_templates (company_id, text) VALUES ($1, ' ranger LE dépôt ')`, [CO])) === '23505', 'doublon (casse, espaces) refusé (23505)');
check((await err(`INSERT INTO public.task_templates (company_id, text, created_by) VALUES ($1, 'y', $2)`, [CO, ADMIN])) === '42501', 'created_by non envoyable');
check((await err(`INSERT INTO public.task_templates (company_id, text) VALUES ($1, 'y')`, [CO2])) === '42501', 'refus : autre entreprise');
check((await err(`UPDATE public.task_templates SET text = 'z'`)) === '42501', 'pas de modification (on retire et on remet)');
await as(SAM);
check((await rows(`SELECT * FROM public.task_templates`)).length === 0, 'salarié : ne lit pas la liste');
check((await err(`INSERT INTO public.task_templates (company_id, text) VALUES ($1, 'x')`, [CO])) === '42501', 'salarié : n’ajoute pas');
check((await rows(`DELETE FROM public.task_templates RETURNING id`)).length === 0, 'salarié : n’efface pas');
await as(ADMIN2);
check((await rows(`SELECT * FROM public.task_templates`)).length === 0, 'autre entreprise : liste invisible');
check((await rows(`DELETE FROM public.task_templates RETURNING id`)).length === 0, 'autre entreprise : n’efface rien');
await as(ADMIN);
check((await rows(`DELETE FROM public.task_templates WHERE id = $1 RETURNING id`, [tpl.id])).length === 1, 'le bureau retire une tâche habituelle');

// ═══ Réunions ══════════════════════════════════════════════════════════════
section('Réunions : posées d’un bloc par le bureau, jamais en direct');
await as(ADMIN);
const M1 = await one(`SELECT * FROM public.office_save_meeting(NULL, 'Point sécurité', $1, '14:00', NULL, 'Dépôt', false, $2::uuid[])`, [D, `{${SAM},${CHEF}}`]);
check(!!M1?.id && M1.place === 'Dépôt' && M1.all_team === false && M1.created_by === ADMIN, 'réunion posée (Sam + chef d’équipe), lieu « Dépôt »');
const M2 = await one(`SELECT * FROM public.office_save_meeting(NULL, '  Équipe  ', $1, '08:00', '09:00', '   ', true, ARRAY[$2::uuid])`, [D, AUTRE]);
check(M2.all_team === true && M2.title === 'Équipe' && M2.place === null, '« Toute l’équipe » : titre nettoyé, lieu vide → NULL, liste ignorée (même un id d’une autre entreprise)');
await root();
check(await count(`SELECT count(*) n FROM public.meeting_participants WHERE meeting_id = $1`, [M2.id]) === 0, '« Toute l’équipe » : aucun participant stocké');
check(await count(`SELECT count(*) n FROM public.meeting_participants WHERE meeting_id = $1`, [M1.id]) === 2, 'réunion choisie : 2 participants stockés');
await as(ADMIN);
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, NULL, false, $2::uuid[])`, [D, `{${AUTRE}}`])) === '22023', 'refus : participant d’une autre entreprise');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, NULL, false, $2::uuid[])`, [D, `{${ANCIEN}}`])) === '22023', 'refus : participant archivé');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, NULL, false, $2::uuid[])`, [D, `{${ADMIN}}`])) === '22023', 'refus : un compte bureau n’est pas participant');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, NULL, false, '{}'::uuid[])`, [D])) === '22023', 'refus : aucun participant sans « Toute l’équipe »');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', '13:00', NULL, true, NULL)`, [D])) === '22023', 'refus : fin avant le début');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, '   ', $1, '14:00', NULL, NULL, true, NULL)`, [D])) === '22023', 'refus : titre vide');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', NULL, '14:00', NULL, NULL, true, NULL)`)) === '22023', 'refus : sans date');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, repeat('l', 161), true, NULL)`, [D])) === '22023', 'refus : lieu de plus de 160 caractères');
check((await err(`INSERT INTO public.meetings (company_id, title, meeting_date, start_time) VALUES ($1, 'x', $2, '10:00')`, [CO, D])) === '42501', 'pas d’écriture directe dans meetings');
check((await err(`INSERT INTO public.meeting_participants (meeting_id, company_id, user_id) VALUES ($1, $2, $3)`, [M1.id, CO, ALEX])) === '42501', 'pas d’écriture directe dans meeting_participants');
check((await err(`DELETE FROM public.meetings WHERE id = $1`, [M1.id])) === '42501', 'pas d’effacement direct');

section('Réunions : qui les voit');
await as(SAM);
check((await rows(`SELECT id FROM public.meetings ORDER BY start_time`)).map((x) => x.id).join() === [M2.id, M1.id].join(), 'Sam voit sa réunion + « Toute l’équipe » (pas de récursion de policy)');
check((await rows(`SELECT user_id FROM public.meeting_participants`)).map((x) => x.user_id).join() === SAM, 'Sam ne lit que SA participation (pas la liste des autres)');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, NULL, true, NULL)`, [D])) === '42501', 'salarié : ne pose pas de réunion');
check((await err(`SELECT public.office_delete_meeting($1)`, [M1.id])) === '42501', 'salarié : ne retire pas de réunion');
await as(ALEX);
check((await rows(`SELECT id FROM public.meetings`)).map((x) => x.id).join() === M2.id, 'Alex (non invité) ne voit que « Toute l’équipe »');
check((await rows(`SELECT * FROM public.meeting_participants`)).length === 0, 'Alex ne lit aucune participation');
await as(CHEF);
check((await rows(`SELECT id FROM public.meetings`)).length === 2, 'chef d’équipe invité : voit les deux');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, NULL, true, NULL)`, [D])) === '42501', 'chef d’équipe : ne pose pas de réunion (bureau seulement)');
await as(ANCIEN);
check((await rows(`SELECT id FROM public.meetings`)).length === 0, 'archivé : ne voit rien, pas même « Toute l’équipe »');
await as(EXADMIN);
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '08:00', NULL, NULL, true, NULL)`, [D])) === '42501', 'bureau archivé : ne pose pas de réunion');
check((await rows(`SELECT * FROM public.meetings`)).length === 0, 'bureau archivé : ne lit rien');
await as(ADMIN2);
check((await rows(`SELECT id FROM public.meetings`)).length === 0, 'autre entreprise : aucune réunion lue');
check((await rows(`SELECT * FROM public.meeting_participants`)).length === 0, 'autre entreprise : aucune participation lue');
check((await err(`SELECT * FROM public.office_save_meeting($1, 'pirate', $2, '14:00', NULL, NULL, true, NULL)`, [M1.id, D])) === 'P0002', 'autre entreprise : ne modifie pas (P0002)');
check((await err(`SELECT public.office_delete_meeting($1)`, [M1.id])) === 'P0002', 'autre entreprise : ne retire pas (P0002)');
await as('', 'anon');
check((await err(`SELECT * FROM public.meetings`)) === '42501', 'anon : lecture refusée');
check((await err(`SELECT * FROM public.office_save_meeting(NULL, 'x', $1, '14:00', NULL, NULL, true, NULL)`, [D])) === '42501', 'anon : fonction refusée');

section('Réunions : modifier, retirer');
await as(ADMIN);
const M1b = await one(`SELECT * FROM public.office_save_meeting($1, 'Point sécurité', $2, '15:00', '16:00', 'Dépôt', false, $3::uuid[])`, [M1.id, D, `{${ALEX}}`]);
check(M1b.id === M1.id && String(M1b.start_time).startsWith('15:00') && M1b.updated_at >= M1.updated_at, 'réunion modifiée (même id, 15:00–16:00)');
await as(SAM);
check((await rows(`SELECT id FROM public.meetings WHERE id = $1`, [M1.id])).length === 0, 'Sam retiré de la liste : ne la voit plus');
await as(ALEX);
check((await rows(`SELECT id FROM public.meetings WHERE id = $1`, [M1.id])).length === 1, 'Alex ajouté : la voit');
await as(ADMIN);
check((await err(`SELECT * FROM public.office_save_meeting($1, 'x', $2, '15:00', NULL, NULL, false, $3::uuid[])`, ['b0000000-0000-0000-0000-000000000099', D, `{${ALEX}}`])) === 'P0002', 'réunion inconnue : P0002');
check((await one(`SELECT public.office_delete_meeting($1) AS ok`, [M1.id])).ok === true, 'réunion retirée');
check((await err(`SELECT public.office_delete_meeting($1)`, [M1.id])) === 'P0002', 'retirer deux fois : P0002');
await root();
check(await count(`SELECT count(*) n FROM public.meeting_participants WHERE meeting_id = $1`, [M1.id]) === 0, 'ses participants sont partis avec elle');

// ═══ Jamais des heures ═════════════════════════════════════════════════════
section('Jamais des heures, jamais du planning');
await root();
check(await count(`SELECT count(*) n FROM public.time_entries`) === 0 && await count(`SELECT count(*) n FROM public.planning`) === 0
  && await count(`SELECT count(*) n FROM public.active_sessions`) === 0, 'aucune heure, aucun planning, aucun chrono écrit par les tâches et les réunions');

// ═══ Supprimer un salarié, un auteur ═══════════════════════════════════════
section('Supprimer un salarié (fiche salarié) marche toujours');
await as(ADMIN);
const M3 = await one(`SELECT * FROM public.office_save_meeting(NULL, 'Rendez-vous', $1, '10:00', NULL, NULL, false, $2::uuid[])`, [D, `{${NINA},${ALEX}}`]);
await root();
check(!(await err(`DELETE FROM public.users WHERE id = $1`, [NINA])), 'supprimer Nina (une tâche, une participation) : accepté');
check(await count(`SELECT count(*) n FROM public.day_tasks WHERE user_id = $1`, [NINA]) === 0
  && await count(`SELECT count(*) n FROM public.meeting_participants WHERE user_id = $1`, [NINA]) === 0, '… ses tâches et sa participation partent avec elle (CASCADE)');
check(await count(`SELECT count(*) n FROM public.meeting_participants WHERE meeting_id = $1`, [M3.id]) === 1, '… la réunion reste, avec Alex');
check(!(await err(`DELETE FROM public.users WHERE id = $1`, [CHEF])), 'supprimer le chef d’équipe (une tâche) : accepté');
check(!(await err(`DELETE FROM public.users WHERE id = $1`, [SAM])), 'supprimer Sam (sa tâche cochée « Fait ») : accepté');
check(!(await err(`DELETE FROM public.users WHERE id = $1`, [ADMIN])), 'supprimer l’auteur (bureau) : accepté');
check(await count(`SELECT count(*) n FROM public.meetings WHERE created_by IS NULL`) >= 2, '… ses réunions restent, created_by = NULL (SET NULL)');

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
const gone = await one(`SELECT (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)) AS t,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($2)) AS f,
  (SELECT count(*) FROM pg_policies WHERE tablename = ANY($1)) AS p`, [NEW_TABLES, NEW_FNS]);
check(Number(gone.t) === 0 && Number(gone.f) === 0 && Number(gone.p) === 0, 'tables, fonctions et policies du lot retirées');
// Les objets existants n'ont pas bougé (les lignes supprimées plus haut ne comptent pas : on compare la structure).
const back = await prints();
check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.priv === before.priv,
  'après retour arrière : fonctions, policies, triggers, colonnes et droits existants identiques à avant la migration');
check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
{
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification après application : de nouveau toute à true');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
