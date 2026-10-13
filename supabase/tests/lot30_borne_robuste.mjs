// Lot 30 — BORNE ROBUSTE : l'état de l'écran de la tablette (kiosks.client_state,
// kiosks.client_state_at), rejoué POUR DE VRAI sur un Postgres jetable en mémoire
// (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:borne-robuste-db
//
// Même bouchon que les lots 11 et 12 (fonctions et policies de PRODUCTION
// recopiées mot pour mot, relu depuis lot11_cloture_salarie.mjs). Les migrations
// des lots 1 (borne), 9, 11, 12 (pointage QR), 0, 12 (QR fixe) et 11 (appairage)
// sont chargées TELLES QUELLES, puis — avec les droits PAR DÉFAUT de production
// (tout pour anon / authenticated / service_role sur les objets neufs) — celle du
// lot 30, DEUX fois ; puis son RETOUR ARRIÈRE (décommenté) est exécuté, et elle est
// rechargée.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const MIG_FILE = fs.readdirSync(path.join(here, '..', 'migrations')).find((f) => f.endsWith('_lot30_borne_robuste.sql'));
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
const lot11 = fs.readFileSync(path.join(here, 'lot11_cloture_salarie.mjs'), 'utf8');
const STUB = lot11.slice(lot11.indexOf('const STUB = `') + 'const STUB = `'.length, lot11.indexOf('`;', lot11.indexOf('const STUB = `')));

const CO = 'c0000000-0000-0000-0000-000000000001';
const CO2 = 'c0000000-0000-0000-0000-000000000002';
const ADMIN = 'a0000000-0000-0000-0000-00000000000a';
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b'; // bureau d'une AUTRE entreprise
const LUCAS = '10000000-0000-0000-0000-000000000001';
const WS = 'e0000000-0000-0000-0000-000000000001', WS2 = 'e0000000-0000-0000-0000-000000000002';
const TAB = 'f0000000-0000-0000-0000-000000000001'; // tablette de CO
const TAB2 = 'f0000000-0000-0000-0000-000000000002'; // tablette de CO2

const EXTRA = `
CREATE TABLE public.planning (id uuid PRIMARY KEY, user_id uuid, work_date date, estimated_end time);
GRANT SELECT ON public.planning TO authenticated;
GRANT ALL ON public.planning TO service_role;
ALTER TABLE public.time_entries ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Paul', 'Martin'), ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${LUCAS}', '${CO}', 'worker', true, 'Lucas', 'Petit');
INSERT INTO public.worksites VALUES ('${WS}', '${CO}'), ('${WS2}', '${CO2}');
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);
const db = new PGlite();
await db.exec(STUB);
await db.exec(EXTRA);
// L'existant, tel qu'en production.
for (const f of ['20260929090000_lot1_borne_pointage_qr.sql', '20261001120000_lot9_fin_pointage.sql', '20261002120000_lot11_cloture_salarie.sql',
  '20261003120000_lot12_pointage_qr.sql', '20261011090000_lot0_fermeture_pointages_oublies.sql', '20261011150000_lot12_qr_fixe_position.sql',
  '20261013090000_lot11_appairage_un_geste.sql']) await db.exec(mig(f));
// En production, la clé service a tous les droits sur les tables du lot 1 (droits par défaut).
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  INSERT INTO public.kiosks (id, company_id, name, token_hash, seed_salt, created_at, last_seen_at) VALUES
    ('${TAB}', '${CO}', 'Borne', 'h1', 's1', now() - interval '3 days', now() - interval '2 minutes'),
    ('${TAB2}', '${CO2}', 'Borne', 'h2', 's2', now() - interval '3 days', now() - interval '2 minutes');
  INSERT INTO public.kiosk_settings (company_id, active_from, active_until) VALUES ('${CO}', '06:00', '20:00');`);

const as = async (uid, role = 'authenticated') => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`SET ROLE ${role}`);
};
const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); };
const asService = () => as('', 'service_role');
/** Code d'erreur Postgres (ou message) ; null = accepté. */
const err = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return e.code || e.message; } };
const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];

/** Les lignes SQL commentées du fichier entre deux repères (comme les tests des lots 3, 4, 6, 7, 11 et 12). */
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
const NEW_COLS = ['client_state', 'client_state_at'];

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
section('Migration : additive (aucun DROP ni DELETE exécuté), rejouable, droits repris');
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace`)).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND NOT (table_name = 'kiosks' AND column_name = ANY($1))`, [NEW_COLS])).s;
const conPrint = async () => (await one(`SELECT string_agg(conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY conname) AS s
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname <> 'kiosks_client_state_forme'`)).s;
const idxPrint = async () => (await one(`SELECT string_agg(indexname || ':' || md5(indexdef), ',' ORDER BY indexname) AS s FROM pg_indexes WHERE schemaname = 'public'`)).s;
const tblPrint = async () => (await one(`SELECT string_agg(relname, ',' ORDER BY relname) AS s FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','v','m','S')`)).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY 1, 2`));
const colPrivPrint = async () => JSON.stringify(await rows(`SELECT table_name, column_name, r.rolname,
    has_column_privilege(r.rolname, 'public.' || table_name, column_name, 'SELECT') AS s,
    has_column_privilege(r.rolname, 'public.' || table_name, column_name, 'INSERT,UPDATE') AS w
  FROM information_schema.columns CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE table_schema = 'public' AND table_name LIKE 'kiosk%' AND NOT (table_name = 'kiosks' AND column_name = ANY($1))
  ORDER BY 1, 2, 3`, [NEW_COLS]));
const dataPrint = async () => JSON.stringify([
  await rows(`SELECT id, company_id, name, token_hash, seed_salt, kind, last_seen_at, revoked_at FROM public.kiosks ORDER BY id`),
  await rows(`SELECT company_id FROM public.kiosk_settings ORDER BY 1`),
]);
const prints = async () => ({ tbl: await tblPrint(), fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(),
  idx: await idxPrint(), priv: await privPrint(), colpriv: await colPrivPrint(), data: await dataPrint() });
const before = await prints();
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
check(/^\d{14}_lot30_borne_robuste\.sql$/.test(MIG_FILE) && MIG_FILE > '20261013143711', `fichier ${MIG_FILE} (après la dernière migration du dépôt)`);
{
  // Contrôle automatique : hors commentaires, AUCUNE instruction DROP / DELETE
  // (ni TRUNCATE, CASCADE, ON DELETE, RENAME, ALTER COLUMN, ALTER POLICY, UPDATE de données).
  const code = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const bad = code.match(/\b(DROP|DELETE|TRUNCATE|CASCADE|ON\s+DELETE|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|UPDATE\s+public\.)\b/gi) || [];
  check(bad.length === 0, `aucun DROP / DELETE / TRUNCATE / CASCADE / ON DELETE / RENAME / ALTER COLUMN / ALTER POLICY / UPDATE hors commentaires (${bad.join(', ') || 'aucun'})`);
  check(!/\b(DROP|DELETE|TRUNCATE|CASCADE)\b/i.test(code), 'les mots DROP, DELETE, TRUNCATE, CASCADE n’apparaissent nulle part hors commentaires « -- » (corps de fonction et texte de COMMENT compris)');
  check(!/CREATE\s+POLICY|ALTER\s+POLICY|ENABLE\s+ROW\s+LEVEL|DISABLE\s+ROW\s+LEVEL|FORCE\s+ROW/i.test(code), 'aucune règle de ligne neuve ni modifiée (la lecture reste kiosks_admin_read)');
  check(!/CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER|TABLE|INDEX)|REFERENCES|FOREIGN\s+KEY/i.test(code), 'aucune fonction, aucun trigger, aucune table, aucun index, aucune clé étrangère : deux colonnes seulement');
  const head = SQL.split('\n').slice(0, 60).join('\n');
  check(/RETOUR ARRIÈRE/.test(head) && /VÉRIFICATION APRÈS APPLICATION/.test(head) && /HISTORIQUE/.test(head)
    && /INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\n--\s+VALUES \('20261013170000', 'lot30_borne_robuste'\) ON CONFLICT DO NOTHING;/.test(head),
    'en-tête : RETOUR ARRIÈRE, VÉRIFICATION APRÈS APPLICATION, HISTORIQUE (version et nom du fichier) dans les 60 premières lignes');
  check(/8 × true/.test(head), 'la vérification annonce « 8 × true »');
}
{ const e = await errExec(SQL); check(!e, `migration chargée${e ? ` — ${e}` : ''}`); }
{ const e = await errExec(SQL); check(!e, `… une deuxième fois sans erreur (rejouable)${e ? ` — ${e}` : ''}`); }
const after = await prints();
check(before.tbl === after.tbl, 'aucune table, vue ni séquence neuve');
check(before.fn === after.fn, 'fonctions existantes inchangées (company_kiosk_active, company_has_kiosk, kiosk_open_session, gardes…)');
check(before.pol === after.pol, 'policies existantes inchangées (aucune règle de ligne neuve)');
check(before.trg === after.trg, 'triggers existants inchangés (aucun trigger ajouté)');
check(before.col === after.col, 'colonnes existantes inchangées (hors les deux neuves)');
check(before.con === after.con, 'contraintes existantes inchangées');
check(before.idx === after.idx, 'index existants inchangés (aucun index neuf)');
check(before.priv === after.priv, 'droits des tables existantes inchangés (anon, authenticated, service_role)');
check(before.colpriv === after.colpriv, 'droits par colonne existants inchangés (le bureau ne lit toujours ni le sel ni l’empreinte du jeton)');
check(before.data === after.data, 'données existantes intactes (tablettes, réglages)');
check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 8 && bad.length === 0, `vérification après application : 8 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}

// ═══ Structure ═════════════════════════════════════════════════════════════
section('Structure : deux colonnes facultatives, sans valeur par défaut, existant intact');
{
  const c = await rows(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kiosks' AND column_name = ANY($1) ORDER BY column_name`, [NEW_COLS]);
  check(c.length === 2 && c[0].column_name === 'client_state' && c[0].data_type === 'jsonb' && c[0].is_nullable === 'YES' && c[0].column_default === null, 'client_state : jsonb, NULL permis, sans valeur par défaut');
  check(c[1].column_name === 'client_state_at' && c[1].data_type === 'timestamp with time zone' && c[1].is_nullable === 'YES' && c[1].column_default === null, 'client_state_at : timestamptz, NULL permis, sans valeur par défaut');
  const r = await rows(`SELECT id, client_state, client_state_at FROM public.kiosks ORDER BY id`);
  check(r.length === 2 && r.every((x) => x.client_state === null && x.client_state_at === null), 'les tablettes existantes : les deux colonnes valent NULL (aucune réécriture)');
  check((await rows(`SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.kiosks'::regclass AND NOT tgisinternal`)).length === 0, 'aucun trigger sur kiosks');
}

section('Contrainte : un objet, 256 octets au plus — quoi que la fonction écrive');
await asService();
const SET = `UPDATE public.kiosks SET client_state = $2::jsonb, client_state_at = now() WHERE id = $1`;
const GOOD = { wake: 'held', standalone: true, fullscreen: true, online: true, version: 'a3f09c1d' };
check(await err(SET, [TAB, JSON.stringify(GOOD)]) === null, 'service : un état complet s’écrit');
{
  const back = (await one(`SELECT client_state AS s FROM public.kiosks WHERE id = $1`, [TAB])).s;
  check(back.wake === 'held' && back.standalone === true && back.fullscreen === true && back.online === true && back.version === 'a3f09c1d', '… et se relit à l’identique');
  check(JSON.stringify(GOOD).length < 256, `l’état réel pèse ${JSON.stringify(GOOD).length} octets, très sous la borne de 256`);
}
check(await err(SET, [TAB, JSON.stringify({ wake: 'denied' })]) === null, 'service : un état partiel s’écrit');
check(await err(SET, [TAB, '[]']) === '23514', 'un tableau : refusé');
check(await err(SET, [TAB, '"texte"']) === '23514' && await err(SET, [TAB, '42']) === '23514' && await err(SET, [TAB, 'true']) === '23514', 'un texte, un nombre, un booléen seuls : refusés');
check(await err(SET, [TAB, JSON.stringify({ version: 'x'.repeat(300) })]) === '23514', 'un objet de plus de 256 octets : refusé');
check(await err(SET, [TAB, JSON.stringify({ a: 'x'.repeat(230) })]) === null, 'un objet de moins de 256 octets : accepté (la fonction, elle, ne laisse passer que 5 champs)');
check(await err(SET, [TAB, JSON.stringify({ a: 'x'.repeat(250) })]) === '23514', '… à 256 octets et plus : refusé');
check(await err(`UPDATE public.kiosks SET client_state = NULL, client_state_at = NULL WHERE id = $1`, [TAB]) === null, 'service : l’état peut être remis à NULL (jamais reçu)');
check(await err(SET, [TAB, JSON.stringify(GOOD)]) === null, 'service : réécrit pour la suite');
check(await err(`UPDATE public.kiosks SET last_seen_at = now() WHERE id = $1`, [TAB]) === null
  && (await one(`SELECT client_state IS NOT NULL AS has FROM public.kiosks WHERE id = $1`, [TAB])).has === true, 'service : le « vu à » (last_seen_at) s’écrit à part, sans toucher l’état');
check(await err(`UPDATE public.kiosks SET client_state_at = now() WHERE id = $1`, [TAB2]) === null, 'service : la date seule s’écrit aussi (état encore NULL)');
await asService();
check(await err(`UPDATE public.kiosks SET client_state_at = NULL WHERE id = $1`, [TAB2]) === null, 'service : et se remet à NULL');

section('Droits : le bureau de SON entreprise lit ; personne n’écrit côté navigateur ; la clé service écrit');
await root();
await db.exec(`UPDATE public.kiosks SET client_state = '{"wake":"denied","standalone":false}'::jsonb, client_state_at = now() WHERE id = '${TAB}';
  UPDATE public.kiosks SET client_state = '{"wake":"held"}'::jsonb, client_state_at = now() WHERE id = '${TAB2}'`);
const READ = `SELECT id, client_state, client_state_at FROM public.kiosks`;
await as(ADMIN);
{
  const r = await rows(READ);
  check(r.length === 1 && r[0].id === TAB && r[0].client_state?.wake === 'denied' && r[0].client_state_at, 'administrateur : lit l’état de la tablette de SON entreprise');
  check((await rows(`SELECT id FROM public.kiosks WHERE id = $1`, [TAB2])).length === 0, 'administrateur : ne voit pas la tablette d’une autre entreprise (règle de ligne inchangée)');
  check(await err(`SELECT token_hash FROM public.kiosks`) === '42501' && await err(`SELECT seed_salt FROM public.kiosks`) === '42501', 'administrateur : le sel et l’empreinte du jeton restent fermés');
  check(await err(`SELECT id, name, kind, last_seen_at, client_state, client_state_at FROM public.kiosks`) === null, 'administrateur : la lecture exacte du bureau (colonnes nommées) passe');
}
await as(ADMIN2);
{
  const r = await rows(READ);
  check(r.length === 1 && r[0].id === TAB2 && r[0].client_state?.wake === 'held', 'administrateur d’une autre entreprise : voit SEULEMENT sa tablette');
}
await as(LUCAS);
check((await rows(READ)).length === 0, 'salarié : ne lit aucune tablette (règle réservée à l’administrateur)');
await as('', 'anon');
check(await err(READ) === '42501' && await err(`SELECT client_state FROM public.kiosks`) === '42501' && await err(`SELECT client_state_at FROM public.kiosks`) === '42501', 'anonyme : lecture refusée');
for (const [label, uid, role] of [['administrateur (authenticated)', ADMIN, 'authenticated'], ['administrateur d’une autre entreprise', ADMIN2, 'authenticated'],
  ['salarié', LUCAS, 'authenticated'], ['anonyme', '', 'anon']]) {
  await as(uid, role);
  check(await err(`UPDATE public.kiosks SET client_state = '{"wake":"held"}'::jsonb WHERE id = $1`, [TAB]) === '42501', `${label} : écrire client_state refusé`);
  check(await err(`UPDATE public.kiosks SET client_state_at = now() WHERE id = $1`, [TAB]) === '42501', `${label} : écrire client_state_at refusé`);
  check(await err(`INSERT INTO public.kiosks (company_id, name, token_hash, seed_salt, client_state) VALUES ($1, 'x', 'h', 's', '{"wake":"held"}')`, [CO]) === '42501', `${label} : créer une tablette avec un état refusé`);
}
await asService();
check(await err(`SELECT client_state, client_state_at FROM public.kiosks`) === null, 'clé service : lit les deux colonnes');
check(await err(SET, [TAB, JSON.stringify(GOOD)]) === null, 'clé service : écrit (comme la fonction kiosk)');
await root();
{
  const priv = await rows(`SELECT role, col, p FROM unnest(ARRAY['authenticated','anon']) role, unnest($1::text[]) col, unnest(ARRAY['INSERT','UPDATE','REFERENCES']) p
    WHERE has_column_privilege(role, 'public.kiosks', col, p)`, [NEW_COLS]);
  check(priv.length === 0, `ni anon ni authenticated n’ont INSERT / UPDATE / REFERENCES sur les colonnes neuves, malgré les droits par défaut (${priv.map((x) => `${x.role}:${x.col}:${x.p}`).join(' ') || 'aucun'})`);
  const pol = await rows(`SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kiosks'`);
  check(pol.length === 1 && pol[0].policyname === 'kiosks_admin_read' && pol[0].cmd === 'SELECT', `kiosks : toujours la seule règle de lecture kiosks_admin_read (${pol.map((p) => p.policyname).join(', ')})`);
}

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
check((await rows(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosks' AND column_name = ANY($1)`, [NEW_COLS])).length === 0, 'les deux colonnes ont disparu');
check((await rows(`SELECT 1 FROM pg_constraint WHERE conname = 'kiosks_client_state_forme'`)).length === 0, 'la contrainte aussi');
const back = await prints();
check(back.tbl === before.tbl && back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.con === before.con
  && back.idx === before.idx && back.priv === before.priv && back.colpriv === before.colpriv,
  'après retour arrière : tables, fonctions, policies, triggers, colonnes, contraintes, index et droits identiques à avant la migration');
{
  // Les lectures du bureau et de la fonction « avant la migration » : colonne inconnue (42703), jamais autre chose.
  await as(ADMIN);
  check(await err(`SELECT id, client_state FROM public.kiosks`) === '42703', 'sans les colonnes : la lecture qui les nomme échoue en 42703 (le bureau retombe sur la lecture d’avant)');
  check(await err(`SELECT id, created_at, last_seen_at, kind FROM public.kiosks`) === null, '… la lecture d’avant, elle, marche');
  await asService();
  check(await err(`UPDATE public.kiosks SET client_state = '{"wake":"held"}'::jsonb WHERE id = $1`, [TAB]) === '42703', 'sans les colonnes : l’écriture de la fonction échoue en 42703 (la fonction l’ignore)');
  await root();
}
{ const e = await errExec(SQL); check(!e, `la migration se recharge après le retour arrière${e ? ` — ${e}` : ''}`); }
{
  const v = await one(POST_SQL);
  check(Object.keys(v).length === 8 && Object.values(v).every((x) => x === true), 'vérification après application : de nouveau 8 × true');
}
check((await rows(`SELECT 1 FROM public.kiosks WHERE client_state IS NOT NULL`)).length === 0, 'rechargée : les colonnes sont neuves (NULL partout)');
await as(ADMIN);
check(await err(`SELECT id, client_state, client_state_at FROM public.kiosks`) === null, 'rechargée : le bureau relit les colonnes');

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
