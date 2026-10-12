// Lot 8 — versions du planning. Rejoué POUR DE VRAI sur un Postgres jetable
// (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:versions-db
//
// État de la production : le bouchon des lots 2, 11, 12 et 14 (fonctions et
// policies recopiées mot pour mot), la table planning et des cases déjà là, les
// droits PAR DÉFAUT de production (tout pour anon / authenticated sur les objets
// neufs). Le fichier du lot 8 est chargé TEL QUEL, deux fois, sous surveillance :
// un déclencheur d'événement note toute commande DDL et tout objet supprimé, un
// déclencheur par table note tout DELETE — il ne doit y en avoir AUCUN. La
// vérification de son en-tête doit renvoyer 10 × true ; son RETOUR ARRIÈRE
// (en-tête) est exécuté (les versions déjà gardées restent), puis le fichier est
// rechargé.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(here, '..', 'migrations', '20261012100000_lot8_versions_planning.sql'), 'utf8');
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
const ADMIN_OFF = 'a0000000-0000-0000-0000-00000000000c'; // bureau archivé
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b'; // bureau d'une AUTRE entreprise
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const W = '90000000-0000-0000-0000-000000000009';
const MON = '2026-10-12';
const NEXT = '2026-10-19';

const EXTRA = `
CREATE TABLE public.planning (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, work_date date, worksite_id uuid,
  absence_type text, estimated_start time, estimated_end time, notes text, created_by uuid, created_at timestamptz DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning TO authenticated;
GRANT ALL ON public.planning TO service_role;
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'),
  ('${ADMIN_OFF}', '${CO}', 'admin', false, 'Ancien', 'Bureau'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'),
  ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Exemple');
INSERT INTO public.worksites VALUES ('${W}', '${CO}');
INSERT INTO public.planning (company_id, user_id, work_date, worksite_id, estimated_start, estimated_end, created_by) VALUES
  ('${CO}', '${SAM}', '2026-10-12', '${W}', '08:00', '12:00', '${ADMIN}'),
  ('${CO}', '${ALEX}', '2026-10-13', '${W}', '13:30', '17:00', '${ADMIN}');
INSERT INTO public.planning (company_id, user_id, work_date, absence_type, created_by) VALUES ('${CO}', '${SAM}', '2026-10-16', 'conge', '${ADMIN}');
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
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;`);

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

// L'en-tête : RETOUR ARRIÈRE, VÉRIFICATION, HISTORIQUE (lignes « --   … »).
const header = SQL.slice(0, SQL.indexOf('-- ─────'));
const block = (from, to) => header.slice(header.indexOf(from), header.indexOf(to)).split('\n').slice(1)
  .filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n').trim();
const ROLLBACK_SQL = block('-- RETOUR ARRIÈRE', '-- Pour retirer AUSSI');
const POST_SQL = block('-- VÉRIFICATION', '-- HISTORIQUE');
const HISTO_SQL = header.slice(header.indexOf('-- HISTORIQUE')).split('\n').slice(1).filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n').trim();
// Le SQL EXÉCUTABLE : sans les commentaires (« -- » hors d'une chaîne, et /* … */).
const stripComments = (sql) => {
  let out = '', i = 0, quote = null;
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (quote) { out += c; if (c === quote) { if (n === quote) { out += n; i += 2; continue; } quote = null; } i++; continue; }
    if (c === "'") { quote = c; out += c; i++; continue; }
    if (c === '-' && n === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? sql.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
};
const code = stripComments(SQL);

// ═══ Le texte du fichier ═══════════════════════════════════════════════════
section('Le fichier : additif, en-tête complet');
check(!/\b(DROP|DELETE|TRUNCATE|CASCADE)\b|\bON\s+DELETE\b/i.test(code),
  'hors commentaires : aucun DROP, DELETE, TRUNCATE, CASCADE ni « ON DELETE » (même pas dans une chaîne)');
check(!/\b(RENAME|UPDATE)\b|\bALTER\s+(COLUMN|POLICY|FUNCTION)\b/i.test(code),
  'hors commentaires : ni RENAME, ni UPDATE, ni ALTER COLUMN / POLICY / FUNCTION');
check(/\bDROP\b/.test(SQL) && /\bDELETE\b/.test(SQL) && !/\bDROP\b|\bDELETE\b/.test(code) && stripComments("a -- DROP\nb /* DELETE */ '-- DROP'") === "a \nb  '-- DROP'",
  'le contrôle voit bien les mots dans les commentaires de l’en-tête (et seulement là) : il marche');
check((code.match(/\bALTER TABLE public\.(\w+)/g) || []).every((x) => x.endsWith('planning_versions')), 'seule la table neuve est modifiée (ALTER TABLE)');
check((code.match(/\b(REVOKE|GRANT)\b[^;]*;/g) || []).every((x) => /public\.planning_versions/.test(x)), 'droits retirés / donnés seulement sur la table et la fonction neuves');
check(!/FOR\s+(UPDATE|DELETE|ALL)\b/i.test(code), 'aucune policy UPDATE, DELETE ni ALL');
check(!/\bREFERENCES\b/i.test(code), 'aucune clé étrangère (comme les traces : l’historique ne bloque aucune suppression d’entreprise)');
check(/FOR EACH ROW/.test(code), 'déclencheur par ligne (BEFORE INSERT) : le n° est posé avant l’écriture');
check(/SECURITY DEFINER[\s\S]*SET search_path = ''/.test(code) && /REVOKE ALL ON FUNCTION public\.planning_versions_numero\(\) FROM PUBLIC, anon, authenticated/.test(code),
  'fonction SECURITY DEFINER : search_path vide, noms qualifiés, retirée à PUBLIC / anon / authenticated');
check(!!ROLLBACK_SQL && !!POST_SQL && /INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\s+VALUES \('20261012100000', 'lot8_versions_planning'\) ON CONFLICT DO NOTHING;/.test(HISTO_SQL),
  'en-tête : RETOUR ARRIÈRE, VÉRIFICATION et HISTORIQUE (même nom que le fichier)');
check(/\bDROP\b/.test(ROLLBACK_SQL) && !/\bDELETE\b|\bDROP TABLE\b/.test(ROLLBACK_SQL) && !/\bDROP\b|\bDELETE\s+FROM\b/.test(POST_SQL + HISTO_SQL),
  'DROP seulement dans le retour arrière (jamais DROP TABLE), aucun DELETE nulle part en SQL exécutable');


// ═══ Surveillance : DDL, objets supprimés, DELETE ═══════════════════════════
await db.exec(`
CREATE TABLE public.zz_ddl (tag text, obj text);
CREATE TABLE public.zz_deletes (tbl text, n int);
CREATE FUNCTION public.zz_log_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP INSERT INTO public.zz_ddl VALUES (r.command_tag, r.object_identity); END LOOP; END $$;
CREATE FUNCTION public.zz_log_drop() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN FOR r IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP INSERT INTO public.zz_ddl VALUES ('DROPPED ' || tg_tag, r.object_identity); END LOOP; END $$;
CREATE FUNCTION public.zz_log_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO public.zz_deletes VALUES (TG_TABLE_NAME, (SELECT count(*) FROM old_rows)); RETURN NULL; END $$;
CREATE EVENT TRIGGER zz_ddl_end ON ddl_command_end EXECUTE FUNCTION public.zz_log_ddl();
CREATE EVENT TRIGGER zz_drop ON sql_drop EXECUTE FUNCTION public.zz_log_drop();
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'zz\\_%' LOOP
    EXECUTE format('CREATE TRIGGER zz_del AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.zz_log_delete()', t);
  END LOOP; END $$;
`);
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname NOT LIKE 'zz\\_%' AND proname <> 'planning_versions_numero'`)).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s
  FROM pg_policies WHERE tablename <> 'planning_versions'`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger
  WHERE NOT tgisinternal AND tgrelid IS DISTINCT FROM to_regclass('public.planning_versions')`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'planning_versions'`)).s;
const conPrint = async () => (await one(`SELECT string_agg(conrelid::regclass::text || '.' || conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY 1) AS s
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid IS DISTINCT FROM to_regclass('public.planning_versions')`)).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname,
    has_table_privilege(r.rolname, c.oid, 'SELECT') AS s, has_table_privilege(r.rolname, c.oid, 'INSERT') AS i,
    has_table_privilege(r.rolname, c.oid, 'UPDATE') AS u, has_table_privilege(r.rolname, c.oid, 'DELETE') AS d
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname <> 'planning_versions' AND c.relname NOT LIKE 'zz\\_%' ORDER BY 1, 2`));
const dataPrint = async () => JSON.stringify({
  planning: await rows(`SELECT * FROM public.planning ORDER BY id`), users: await rows(`SELECT * FROM public.users ORDER BY id`),
  companies: await rows(`SELECT * FROM public.companies ORDER BY id`), worksites: await rows(`SELECT * FROM public.worksites ORDER BY id`),
});
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(), priv: await privPrint(), data: await dataPrint() });
const before = await prints();

// ═══ Chargement, deux fois ═════════════════════════════════════════════════
section('Migration : chargée deux fois, rien d’existant ne bouge');
check((await err(`SELECT 1 FROM public.planning_versions`)) === '42P01', 'avant : la table n’existe pas (42P01 / PGRST205 côté appli : entrée cachée)');
{ const e = await errExec(SQL); check(!e, `1er chargement sans erreur${e ? ` (${e})` : ''}`); }
{ const e = await errExec(SQL); check(!e, `2e chargement sans erreur (rejouable)${e ? ` (${e})` : ''}`); }
{
  const ddl = await rows(`SELECT tag, obj FROM public.zz_ddl`);
  const tags = Array.from(new Set(ddl.map((x) => x.tag))).sort();
  check(!ddl.some((x) => /^DROPPED|DROP|ALTER POLICY|ALTER FUNCTION/.test(x.tag)), `contrôle automatique : aucun DROP exécuté, aucun objet supprimé (commandes vues : ${tags.join(', ')})`);
  check(ddl.filter((x) => x.tag === 'ALTER TABLE').every((x) => x.obj === 'public.planning_versions'), 'contrôle automatique : ALTER TABLE seulement sur la table neuve');
  check(ddl.filter((x) => /GRANT|REVOKE/.test(x.tag)).length > 0, 'contrôle automatique : la surveillance voit bien les GRANT / REVOKE (elle marche)');
  check((await rows(`SELECT * FROM public.zz_deletes`)).length === 0, 'contrôle automatique : aucun DELETE exécuté, sur aucune table');
}
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (get_my_company_id, is_admin…)');
check(before.pol === after.pol, 'policies existantes inchangées');
check(before.trg === after.trg, 'déclencheurs existants inchangés');
check(before.col === after.col, 'aucune colonne existante ajoutée ni modifiée');
check(before.con === after.con, 'contraintes existantes inchangées');
check(before.priv === after.priv, 'droits des tables existantes inchangés (anon, authenticated, service_role)');
check(before.data === after.data, 'données existantes intactes (planning, salariés, entreprises, chantiers)');
check(Number((await one(`SELECT count(*) AS n FROM pg_trigger WHERE tgname = 'planning_versions_numero'`)).n) === 1, 'le déclencheur n’est posé qu’une fois');
check(Number((await one(`SELECT count(*) AS n FROM pg_policies WHERE tablename = 'planning_versions'`)).n) === 2, 'deux policies, posées une fois');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 10 && bad.length === 0, `vérification d’en-tête : 10 × true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}

// ═══ Le bureau : lire et ajouter ════════════════════════════════════════════
section('Bureau : ajoute et lit les versions de SON entreprise');
const cells = (n = 2) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, user_id: SAM, worksite_id: W, work_date: MON, estimated_start: '08:00:00', estimated_end: null, notes: null })));
const add = (kind, extra = {}) => one(`INSERT INTO public.planning_versions (company_id, week_start, kind, request, note, cells, user_ids)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
[extra.company ?? CO, extra.week ?? MON, kind, extra.request ?? null, extra.note ?? null, extra.cells ?? cells(), extra.users ?? [SAM]]);
await as(ADMIN);
const V1 = await add('initial');
check(V1.number === 1 && V1.created_by === ADMIN && V1.kind === 'initial', 'V1 « initiale » : n° 1, auteur = le bureau connecté (posés par la base)');
const V2 = await add('assistant', { request: 'Fais le planning de la semaine prochaine comme d’habitude', note: 'Planning appliqué : 2 affectations' });
check(V2.number === 2 && V2.request.startsWith('Fais le planning'), 'essai 2 : n° 2, avec la demande');
const V3 = await add('manuel');
check(V3.number === 3, '« Garder cette version » : n° 3');
const N1 = await add('initial', { week: NEXT });
check(N1.number === 1, 'une autre semaine : sa propre V1');
check((await rows(`SELECT number FROM public.planning_versions WHERE week_start = $1 ORDER BY number`, [MON])).map((x) => x.number).join(',') === '1,2,3', 'le bureau lit ses versions, dans l’ordre');
check(new Date(V3.created_at) >= new Date(V1.created_at), 'date posée par la base');
check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind, number) VALUES ($1, $2, 'manuel', 99)`, [CO, MON])) === '42501', 'le n° ne se choisit pas (pas de droit sur la colonne)');
check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind, created_by) VALUES ($1, $2, 'manuel', $3)`, [CO, MON, SAM])) === '42501', 'l’auteur ne se falsifie pas');
check((await err(`INSERT INTO public.planning_versions (id, company_id, week_start, kind) VALUES (gen_random_uuid(), $1, $2, 'manuel')`, [CO, MON])) === '42501', 'l’identifiant ne se choisit pas');
check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind, created_at) VALUES ($1, $2, 'manuel', now() - interval '2 years')`, [CO, MON])) === '42501', 'la date ne se falsifie pas (ni vieillir une version pour la purge)');

section('Numérotation : sans doublon, sans trou, même ajoutée en même temps');
{
  const WEEK = '2026-11-02';
  const out = await Promise.all(Array.from({ length: 12 }, (_, i) => one(`INSERT INTO public.planning_versions (company_id, week_start, kind, note) VALUES ($1, $2, 'manuel', $3) RETURNING number`, [CO, WEEK, `essai ${i}`])));
  const nums = out.map((x) => x.number).sort((a, b) => a - b);
  check(nums.join(',') === Array.from({ length: 12 }, (_, i) => i + 1).join(','), `12 ajouts lancés ensemble : les n° 1 à 12, une fois chacun (${nums.join(',')})`);
  const [a, b] = await Promise.all([
    one(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel') RETURNING number`, [CO, '2026-11-09']),
    one(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel') RETURNING number`, [CO, '2026-11-16'])]);
  check(a.number === 1 && b.number === 1, 'deux semaines différentes : chacune commence à 1');
  const dup = await err(`INSERT INTO public.planning_versions (company_id, week_start, number, kind) VALUES ($1, $2, 3, 'manuel')`, [CO, WEEK]);
  check(dup === '42501', 'et le n° ne se choisit pas, donc ne peut pas faire doublon');
  await root();
  const forced = await one(`INSERT INTO public.planning_versions (company_id, week_start, number, kind) VALUES ($1, $2, 3, 'manuel') RETURNING number, created_by`, [CO, WEEK]);
  check(forced.number === 13 && forced.created_by === null, 'n° imposé même par un super-utilisateur : le déclencheur le remplace (13, pas 3) ; sans connexion, pas d’auteur');
  const all = (await rows(`SELECT number FROM public.planning_versions WHERE company_id = $1 AND week_start = $2 ORDER BY number`, [CO, WEEK])).map((x) => x.number);
  check(all.length === new Set(all).size && all[all.length - 1] === all.length, `n° toujours uniques et sans trou (${all.length} versions, dernier n° ${all[all.length - 1]})`);
  await as(ADMIN);
}

// PGlite n'a qu'UNE connexion : on ne peut pas y entrelacer deux transactions. On prouve donc le
// verrou autrement — (1) la fonction du déclencheur prend le verrou AVANT de lire le plus grand n°,
// avec la clé (entreprise, semaine) ; (2) pendant une transaction, après un ajout, la connexion
// tient bien l'advisory lock de cette clé, et il part au COMMIT. L'essai à plusieurs connexions
// (pgbench sur un vrai Postgres) a été fait à la main, hors dépôt : voir docs/versions-planning.md.
section('Le verrou de la numérotation');
{
  await root();
  const src = String((await one(`SELECT prosrc FROM pg_proc WHERE proname = 'planning_versions_numero' AND pronamespace = 'public'::regnamespace`)).prosrc).toLowerCase().replace(/\s+/g, ' ');
  const iLock = src.indexOf('pg_catalog.pg_advisory_xact_lock(');
  const iMax = src.indexOf('max(');
  check(iLock >= 0 && iMax > iLock, 'la fonction prend le verrou AVANT de chercher le plus grand n°');
  const key = src.slice(iLock, iMax);
  check(key.includes('new.company_id') && key.includes('new.week_start'), 'la clé du verrou : l’entreprise ET la semaine de la ligne ajoutée');
  const WK = '2026-12-07', WK2 = '2026-12-14';
  const keyOf = async (w) => BigInt((await one(`SELECT pg_catalog.hashtextextended('planning_versions|' || $1::text || '|' || $2::text, 0) AS k`, [CO, w])).k);
  const held = async () => (await rows(`SELECT classid::bigint AS c, objid::bigint AS o, objsubid AS sub FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()`));
  const asKey = (l) => ((BigInt(l.c) << 32n) | BigInt(l.o));
  check((await held()).length === 0, 'avant : aucun verrou tenu');
  await as(ADMIN);
  await db.exec('BEGIN');
  await db.query(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel')`, [CO, WK]);
  await root();
  const during = await held();
  const k1 = await keyOf(WK), k2 = await keyOf(WK2);
  check(during.length === 1 && during[0].sub === 1 && asKey(during[0]) === BigInt.asUintN(64, k1), 'dans la transaction, après l’ajout : le verrou de (entreprise, semaine) est tenu — et celui-là seul');
  check(asKey(during[0]) !== BigInt.asUintN(64, k2), 'une autre semaine n’a pas la même clé (elle ne serait pas retardée)');
  await db.exec('COMMIT');
  check((await held()).length === 0, 'après COMMIT : le verrou est rendu (il ne dure que la transaction)');
}

section('Personne ne modifie ni n’efface une version');
await root();
const nBefore = Number((await one(`SELECT count(*) AS n FROM public.planning_versions`)).n);
await as(ADMIN);
check((await err(`UPDATE public.planning_versions SET request = 'autre chose' WHERE id = $1`, [V2.id])) === '42501', 'bureau : ne modifie pas une version (42501)');
check((await err(`UPDATE public.planning_versions SET cells = '[]' WHERE id = $1`, [V1.id])) === '42501', 'bureau : ne réécrit pas la copie des cases');
check((await err(`DELETE FROM public.planning_versions WHERE id = $1`, [V1.id])) === '42501', 'bureau : n’efface pas une version (42501)');
check((await err(`TRUNCATE public.planning_versions`)) === '42501', 'bureau : ne vide pas la table');
await root();
check(Number((await one(`SELECT count(*) AS n FROM public.planning_versions`)).n) === nBefore, `les ${nBefore} versions sont toujours là`);

section('Contrôles de la base');
await as(ADMIN);
const bad = async (kind, extra, label, code = '23514') => check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind, request, note, cells, user_ids)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`, [extra.company ?? CO, extra.week ?? MON, kind, extra.request ?? null, extra.note ?? null, extra.cells ?? cells(), extra.users ?? []])) === code, label);
await bad('initial', { week: '2026-10-14' }, 'refus : la semaine ne commence pas un lundi');
await bad('essai', {}, 'refus : sorte de version inconnue');
await bad('assistant', { request: 'x'.repeat(501) }, 'refus : demande de plus de 500 caractères');
await bad('manuel', { request: 'demande' }, 'refus : une demande ailleurs que sur un essai de l’assistant (D5 : le texte n’est gardé que là)');
await bad('manuel', { note: 'y'.repeat(201) }, 'refus : note de plus de 200 caractères');
await bad('manuel', { cells: '{"a":1}' }, 'refus : copie qui n’est pas une liste');
await bad('manuel', { cells: JSON.stringify(Array.from({ length: 2001 }, () => ({}))) }, 'refus : plus de 2000 cases');
await bad('manuel', { users: Array.from({ length: 1001 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`) }, 'refus : plus de 1000 salariés dans la copie');
check(!(await err(`INSERT INTO public.planning_versions (company_id, week_start, kind, cells) VALUES ($1, $2, 'manuel', $3::jsonb)`, [CO, NEXT, JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}` })))])),
  'accepté : 2000 cases tout juste');
check(!(await err(`INSERT INTO public.planning_versions (company_id, week_start, kind, request, cells) VALUES ($1, $2, 'assistant', $3, '[]')`, [CO, MON, 'x'.repeat(500)])), 'accepté : 500 caractères tout juste, copie vide (semaine vide)');

// ═══ Les autres ════════════════════════════════════════════════════════════
section('Salarié, chef d’équipe, bureau archivé, autre entreprise, anonyme');
for (const [uid, who] of [[SAM, 'salarié'], [CHEF, 'chef d’équipe'], [ADMIN_OFF, 'bureau archivé']]) {
  await as(uid);
  check((await rows(`SELECT * FROM public.planning_versions`)).length === 0, `${who} : ne lit aucune version (ni les demandes)`);
  check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel')`, [CO, MON])) === '42501', `${who} : n’ajoute pas de version`);
  check((await err(`UPDATE public.planning_versions SET note = 'x'`)) === '42501' && (await err(`DELETE FROM public.planning_versions`)) === '42501', `${who} : ne modifie ni n’efface rien`);
}
await as(ADMIN2);
check((await rows(`SELECT * FROM public.planning_versions`)).length === 0, 'autre entreprise : ne lit aucune de nos versions');
check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel')`, [CO, MON])) === '42501', 'autre entreprise : n’ajoute pas chez nous');
{
  const o = await one(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'initial') RETURNING number, created_by`, [CO2, MON]);
  check(o.number === 1 && o.created_by === ADMIN2, 'autre entreprise : chez elle, sa propre numérotation (n° 1)');
}
await as(ADMIN);
check((await rows(`SELECT * FROM public.planning_versions WHERE company_id = $1`, [CO2])).length === 0, 'notre bureau ne lit pas les versions de l’autre entreprise');
await as('', 'anon');
check((await err(`SELECT * FROM public.planning_versions`)) === '42501', 'anonyme : lecture refusée');
check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel')`, [CO, MON])) === '42501', 'anonyme : ajout refusé');
await as('', 'service_role');
check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel')`, [CO, MON])) === '42501'
  && (await err(`DELETE FROM public.planning_versions`)) === '42501' && (await err(`UPDATE public.planning_versions SET note = 'x'`)) === '42501',
'clé de service : n’écrit, ne modifie ni n’efface rien (l’assistant agit avec les droits du bureau connecté)');
await as(SAM);
check((await err(`SELECT public.planning_versions_numero()`)) !== null, 'la fonction du déclencheur ne s’appelle pas directement');

section('Le planning lui-même n’est jamais touché par la table des versions');
await root();
check(before.data === (await dataPrint()), 'planning, salariés, entreprises, chantiers : identiques (une version est une copie, rien de plus)');
check((await rows(`SELECT * FROM public.zz_deletes`)).length === 0, 'toujours aucun DELETE exécuté (les refus ci-dessus n’ont rien effacé)');
{
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification d’en-tête : toujours 10 × true avec des versions gardées');
}

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (en-tête, tel quel), puis la migration se recharge');
await root();
const nVersions = Number((await one(`SELECT count(*) AS n FROM public.planning_versions`)).n);
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière se rejoue sans erreur${e ? ` (${e})` : ''}`); }
check(Number((await one(`SELECT count(*) AS n FROM public.planning_versions`)).n) === nVersions, `les versions déjà gardées restent (${nVersions}) : rien n’est effacé`);
check((await rows(`SELECT * FROM public.zz_deletes`)).length === 0 && !(await rows(`SELECT tag FROM public.zz_ddl WHERE tag LIKE 'DROPPED%' AND obj LIKE '%planning_versions' AND obj NOT LIKE '%numero%' AND obj NOT LIKE '%office%'`)).length,
  'retour arrière : aucun DELETE, la table n’est pas supprimée');
await as(ADMIN);
check((await err(`SELECT * FROM public.planning_versions`)) === '42501', 'après retour arrière : le bureau ne lit plus rien (l’appli cache l’entrée « Versions »)');
check((await err(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel')`, [CO, MON])) === '42501', 'après retour arrière : l’appli n’écrit plus de version');
await root();
const back = await prints();
check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.con === before.con && back.priv === before.priv && back.data === before.data,
  'après retour arrière : fonctions, policies, déclencheurs, colonnes, contraintes, droits et données d’avant le lot 8 identiques');
check(!(await one(`SELECT to_regprocedure('public.planning_versions_numero()') AS f`)).f, 'la fonction du déclencheur est retirée');
await db.exec(`DELETE FROM public.zz_ddl`);
{ const e = await errExec(SQL); check(!e, `la migration se recharge après le retour arrière${e ? ` (${e})` : ''}`); }
check(!(await rows(`SELECT 1 FROM public.zz_ddl WHERE tag LIKE 'DROP%'`)).length && (await rows(`SELECT * FROM public.zz_deletes`)).length === 0, 'rechargement : toujours aucun DROP ni DELETE');
{
  const v = await one(POST_SQL);
  const bad2 = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(bad2.length === 0, `vérification d’en-tête : de nouveau 10 × true${bad2.length ? ` (faux : ${bad2.join(', ')})` : ''}`);
}
await as(ADMIN);
{
  const r = await one(`INSERT INTO public.planning_versions (company_id, week_start, kind) VALUES ($1, $2, 'manuel') RETURNING number`, [CO, MON]);
  check(r.number === 5 && (await rows(`SELECT 1 FROM public.planning_versions WHERE week_start = $1`, [MON])).length === 5, 'après rechargement : les anciennes versions sont relues, la numérotation continue (n° 5)');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
