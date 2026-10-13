// Lot 11 — APPAIRAGE DE LA TABLETTE EN UN SEUL GESTE, rejoué POUR DE VRAI sur un
// Postgres jetable en mémoire (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:appairage-db
//
// Même bouchon que les lots 11, 12 et 6 (fonctions et policies de PRODUCTION
// recopiées mot pour mot, relu depuis lot11_cloture_salarie.mjs). Les
// migrations des lots 1 (borne), 9, 11, 12 (pointage QR), 0 et 12 (QR fixe)
// sont chargées TELLES QUELLES, puis — avec les droits PAR DÉFAUT de production
// (tout pour anon / authenticated / service_role sur les objets neufs) — celle
// de l'appairage en un geste, DEUX fois ; puis son RETOUR ARRIÈRE (décommenté)
// est exécuté, et elle est rechargée.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const MIG_FILE = fs.readdirSync(path.join(here, '..', 'migrations')).find((f) => f.endsWith('_lot11_appairage_un_geste.sql'));
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
const TAB = 'f0000000-0000-0000-0000-000000000001'; // tablette existante de CO
const RID_HASH = 'a'.repeat(64); // empreinte SHA-256 d'un identifiant de demande (fictif)
const SECRET_HASH = 'AbCdEfGhIjKlMnOpQrStUv'; // empreinte tronquée du secret d'appareil (22 signes, fictive)

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
// L'existant, tel qu'en production : borne (lot 1), fin de pointage (9),
// clôture du salarié (11), pointage QR (12), fermeture de nuit (0), QR fixe (12).
await db.exec(mig('20260929090000_lot1_borne_pointage_qr.sql'));
await db.exec(mig('20261001120000_lot9_fin_pointage.sql'));
await db.exec(mig('20261002120000_lot11_cloture_salarie.sql'));
await db.exec(mig('20261003120000_lot12_pointage_qr.sql'));
await db.exec(mig('20261011090000_lot0_fermeture_pointages_oublies.sql'));
await db.exec(mig('20261011150000_lot12_qr_fixe_position.sql'));
// En production, la clé service a tous les droits sur les tables du lot 1 (droits par défaut).
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  INSERT INTO public.kiosks (id, company_id, name, token_hash, seed_salt, created_at) VALUES
    ('${TAB}', '${CO}', 'Borne', 'h1', 's1', now() - interval '3 days');
  INSERT INTO public.kiosk_settings (company_id, active_from, active_until) VALUES ('${CO}', '06:00', '20:00');
  INSERT INTO public.kiosk_pair_failures (ip) VALUES ('198.51.100.7');`);

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

/** Les lignes SQL commentées du fichier entre deux repères (comme les tests des lots 3, 4, 6, 7 et 12). */
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
const NEW_TABLES = ['kiosk_pair_approvals', 'kiosk_pair_throttle'];
const NEW_CONS = ['kiosk_pair_approvals_rid_hash_forme', 'kiosk_pair_approvals_secret_hash_forme', 'kiosk_pair_approvals_etat',
  'kiosk_pair_approvals_remise', 'kiosk_pair_throttle_bucket_plage', 'kiosk_pair_throttle_hits_positif'];

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
section('Migration : additive (aucun DROP ni DELETE exécuté), rejouable, droits repris');
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace`)).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND NOT (table_name = ANY($1))`, [NEW_TABLES])).s;
const conPrint = async () => (await one(`SELECT string_agg(conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY conname) AS s
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT (conname = ANY($1))
    AND conrelid <> coalesce(to_regclass('public.kiosk_pair_approvals'), 0) AND conrelid <> coalesce(to_regclass('public.kiosk_pair_throttle'), 0)`, [NEW_CONS])).s;
const idxPrint = async () => (await one(`SELECT string_agg(indexname || ':' || md5(indexdef), ',' ORDER BY indexname) AS s FROM pg_indexes
  WHERE schemaname = 'public' AND NOT (tablename = ANY($1))`, [NEW_TABLES])).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT (c.relname = ANY($1)) ORDER BY 1, 2`, [NEW_TABLES]));
const colPrivPrint = async () => JSON.stringify(await rows(`SELECT table_name, column_name, r.rolname,
    has_column_privilege(r.rolname, 'public.' || table_name, column_name, 'SELECT') AS s,
    has_column_privilege(r.rolname, 'public.' || table_name, column_name, 'INSERT,UPDATE') AS w
  FROM information_schema.columns CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE table_schema = 'public' AND table_name LIKE 'kiosk%' AND NOT (table_name = ANY($1))
  ORDER BY 1, 2, 3`, [NEW_TABLES]));
const seqPrint = async () => (await one(`SELECT coalesce(string_agg(relname, ',' ORDER BY relname), '') AS s FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace`)).s;
const dataPrint = async () => JSON.stringify([
  await rows(`SELECT id, company_id, revoked_at IS NULL AS actif FROM public.kiosks ORDER BY id`),
  await rows(`SELECT count(*) AS n FROM public.kiosk_pair_failures`),
  await rows(`SELECT company_id FROM public.kiosk_settings ORDER BY 1`),
]);
const prints = async () => ({ seq: await seqPrint(), fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(),
  idx: await idxPrint(), priv: await privPrint(), colpriv: await colPrivPrint(), data: await dataPrint() });
const before = await prints();
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
check(/^\d{14}_lot11_appairage_un_geste\.sql$/.test(MIG_FILE) && MIG_FILE > '20261012100000', `fichier ${MIG_FILE} (après la dernière migration du dépôt)`);
{
  // Contrôle automatique : hors commentaires, AUCUNE instruction DROP / DELETE
  // (ni TRUNCATE, CASCADE, ON DELETE, RENAME, ALTER COLUMN, ALTER POLICY, UPDATE de données).
  const code = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const bad = code.match(/\b(DROP|DELETE|TRUNCATE|CASCADE|ON\s+DELETE|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|UPDATE\s+public\.)\b/gi) || [];
  check(bad.length === 0, `aucune instruction DROP / DELETE / TRUNCATE / CASCADE / ON DELETE / RENAME / ALTER COLUMN / ALTER POLICY / UPDATE hors commentaires (${bad.join(', ') || 'aucune'})`);
  check(!/FOR\s+DELETE/i.test(code) && !/CREATE\s+POLICY/i.test(code), 'aucune policy neuve (ni « FOR DELETE » ni autre)');
  check(!/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|REFERENCES|FOREIGN\s+KEY/i.test(code), 'aucune fonction (donc rien à durcir), aucune clé étrangère (une clé sans ON DELETE bloquerait la suppression d’une entreprise)');
  const head = SQL.split('\n').slice(0, 60).join('\n');
  check(/RETOUR ARRIÈRE/.test(head) && /VÉRIFICATION APRÈS APPLICATION/.test(head) && /HISTORIQUE/.test(head)
    && /INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\n--\s+VALUES \('20261013090000', 'lot11_appairage_un_geste'\) ON CONFLICT DO NOTHING;/.test(head),
    'en-tête : RETOUR ARRIÈRE, VÉRIFICATION APRÈS APPLICATION, HISTORIQUE (version et nom du fichier) dans les 60 premières lignes');
  check(/10 × true/.test(head), 'la vérification annonce « 10 × true »');
  check(/ENABLE ROW LEVEL SECURITY/.test(code) && (code.match(/ENABLE ROW LEVEL SECURITY/g) || []).length === 2, 'RLS activée sur chacune des deux tables neuves');
}
check((await rows(`SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'kiosk_pair_failures_id_seq'`)).length === 1,
  'décor : la séquence d’identité kiosk_pair_failures_id_seq (lot 1) existe — la vérification v10 ne doit pas en être faussée');
{ const e = await errExec(SQL); check(!e, `migration chargée${e ? ` — ${e}` : ''}`); }
{ const e = await errExec(SQL); check(!e, `… une deuxième fois sans erreur (rejouable)${e ? ` — ${e}` : ''}`); }
const after = await prints();
check(before.seq === after.seq, `aucune séquence neuve (pas de colonne d’identité : rien à révoquer, rien d’ouvert à anon) — avant : « ${before.seq} »`);
check(before.fn === after.fn, 'fonctions existantes inchangées (company_kiosk_active, company_has_kiosk, kiosk_open_session, gardes…)');
check(before.pol === after.pol, 'policies existantes inchangées');
check(before.trg === after.trg, 'triggers existants inchangés (aucun trigger ajouté)');
check(before.col === after.col, 'colonnes existantes inchangées');
check(before.con === after.con, 'contraintes existantes inchangées');
check(before.idx === after.idx, 'index existants inchangés');
check(before.priv === after.priv, 'droits des tables existantes inchangés (anon, authenticated, service_role)');
check(before.colpriv === after.colpriv, 'droits par colonne existants inchangés (le bureau ne lit toujours ni le sel ni l’empreinte du jeton)');
check(before.data === after.data, 'données existantes intactes (tablettes, essais ratés du code à 6 chiffres, réglages)');
check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 10 && bad.length === 0, `vérification après application : 10 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
  check(v.v10_index_sans_sequence === true, 'v10 reste vrai alors que kiosk_pair_failures_id_seq existe (la requête ne vise que les deux tables neuves)');
}

// ═══ Contrôles de la base ══════════════════════════════════════════════════
section('Structure : colonnes, contrôles, clé primaire, index');
{
  const cols = async (t) => (await rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`, [t])).map((r) => r.c).join(',');
  check(await cols('kiosk_pair_approvals') === 'approved_at,approved_by,cancelled_at,claimed_at,company_id,created_at,kiosk_id,rid_hash,secret_hash',
    'kiosk_pair_approvals : empreintes, entreprise, qui, quand — ni identifiant, ni secret, ni jeton en clair');
  check(await cols('kiosk_pair_throttle') === 'bucket,hits,window_start', 'kiosk_pair_throttle : un seau, un compteur, une date — ni adresse, ni entreprise');
  check((await rows(`SELECT 1 FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f' AND conrelid = ANY(ARRAY['public.kiosk_pair_approvals'::regclass, 'public.kiosk_pair_throttle'::regclass])`)).length === 0,
    'aucune clé étrangère sur les deux tables');
  check((await one(`SELECT relrowsecurity AS r FROM pg_class WHERE oid = 'public.kiosk_pair_approvals'::regclass`)).r === true
    && (await one(`SELECT relrowsecurity AS r FROM pg_class WHERE oid = 'public.kiosk_pair_throttle'::regclass`)).r === true, 'RLS activée sur les deux tables');
  check((await rows(`SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`, [NEW_TABLES])).length === 0, 'zéro policy : aucune ligne lisible côté navigateur');
  check((await rows(`SELECT 1 FROM pg_trigger WHERE tgrelid = ANY(ARRAY['public.kiosk_pair_approvals'::regclass, 'public.kiosk_pair_throttle'::regclass]) AND NOT tgisinternal`)).length === 0, 'aucun trigger sur les tables neuves');
}

section('Contraintes : formes des empreintes, une confirmation OU un refus, remise seulement d’une confirmation');
await asService();
const INS = `INSERT INTO public.kiosk_pair_approvals (rid_hash, secret_hash, company_id, approved_by, approved_at, cancelled_at, claimed_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
const NOW = new Date().toISOString();
check(await err(INS, [RID_HASH, SECRET_HASH, CO, ADMIN, NOW, null, null]) === null, 'service : une confirmation s’enregistre');
check(await err(INS, [RID_HASH, SECRET_HASH, CO, ADMIN, NOW, null, null]) === '23505', 'une 2e ligne de même rid_hash : refusée (clé primaire = usage unique)');
check(await err(INS, ['b'.repeat(64), SECRET_HASH, CO, ADMIN, null, NOW, null]) === null, 'service : un refus (cancelled_at) s’enregistre');
check(await err(INS, ['z'.repeat(64), SECRET_HASH, CO, ADMIN, NOW, null, null]) === '23514', 'rid_hash non hexadécimal : refusé');
check(await err(INS, ['c'.repeat(63), SECRET_HASH, CO, ADMIN, NOW, null, null]) === '23514', 'rid_hash de 63 signes : refusé');
check(await err(INS, ['C'.repeat(64), SECRET_HASH, CO, ADMIN, NOW, null, null]) === '23514', 'rid_hash en majuscules : refusé (SHA-256 hexadécimal en minuscules)');
check(await err(INS, ['d'.repeat(64), SECRET_HASH.slice(1), CO, ADMIN, NOW, null, null]) === '23514', 'secret_hash de 21 signes : refusé');
check(await err(INS, ['d'.repeat(64), SECRET_HASH + 'A', CO, ADMIN, NOW, null, null]) === '23514', 'secret_hash de 23 signes : refusé');
check(await err(INS, ['d'.repeat(64), SECRET_HASH.slice(1) + '+', CO, ADMIN, NOW, null, null]) === '23514', 'secret_hash hors base64url (« + ») : refusé');
check(await err(INS, ['e'.repeat(64), SECRET_HASH, CO, ADMIN, NOW, NOW, null]) === '23514', 'à la fois confirmée et refusée : refusé');
check(await err(INS, ['e'.repeat(64), SECRET_HASH, CO, ADMIN, null, null, null]) === '23514', 'ni confirmée ni refusée : refusé');
check(await err(INS, ['e'.repeat(64), SECRET_HASH, CO, ADMIN, null, NOW, NOW]) === '23514', 'remise (claimed_at) d’une demande refusée : refusé');
check(await err(INS, ['e'.repeat(64), SECRET_HASH, null, ADMIN, NOW, null, null]) === '23502' && await err(INS, ['e'.repeat(64), SECRET_HASH, CO, null, NOW, null, null]) === '23502',
  'entreprise et administrateur obligatoires');
check((await one(`SELECT created_at IS NOT NULL AS c, kiosk_id IS NULL AS k FROM public.kiosk_pair_approvals WHERE rid_hash = $1`, [RID_HASH])).c === true, 'created_at posé par défaut');
// La remise atomique de la fonction : un seul gagnant.
{
  const claim = `UPDATE public.kiosk_pair_approvals SET claimed_at = now() WHERE rid_hash = $1 AND claimed_at IS NULL AND cancelled_at IS NULL RETURNING rid_hash`;
  check((await rows(claim, [RID_HASH])).length === 1, 'service : la remise (UPDATE … claimed_at IS NULL) réussit une fois…');
  check((await rows(claim, [RID_HASH])).length === 0, '… la deuxième interrogation ne gagne rien (usage unique)');
  check((await rows(claim, ['b'.repeat(64)])).length === 0, '… et une demande refusée ne se remet jamais');
  check(await err(`UPDATE public.kiosk_pair_approvals SET claimed_at = NULL WHERE rid_hash = $1`, [RID_HASH]) === null, 'service : la remise peut être défaite (aucune suppression)');
  check(await err(`UPDATE public.kiosk_pair_approvals SET kiosk_id = $2 WHERE rid_hash = $1`, [RID_HASH, TAB]) === null, 'service : la tablette remise se note (kiosk_id)');
}

section('Plafond de débit : seaux 0 à 4095, un compteur positif, l’écriture de la fonction (upsert)');
check(await err(`INSERT INTO public.kiosk_pair_throttle (bucket, hits) VALUES (17, 1)`) === null, 'service : un seau s’enregistre');
check(await err(`INSERT INTO public.kiosk_pair_throttle (bucket, hits) VALUES (17, 2)`) === '23505', '… une seule ligne par seau (la fonction la réécrit, elle n’en ajoute pas)');
check(await err(`INSERT INTO public.kiosk_pair_throttle (bucket) VALUES (4096)`) === '23514' && await err(`INSERT INTO public.kiosk_pair_throttle (bucket) VALUES (-1)`) === '23514',
  'seau hors de 0 à 4 095 : refusé (au plus 4 096 lignes : la table ne grossit pas)');
check(await err(`INSERT INTO public.kiosk_pair_throttle (bucket) VALUES (4095)`) === null && await err(`INSERT INTO public.kiosk_pair_throttle (bucket) VALUES (0)`) === null, 'seaux 0 et 4 095 : acceptés');
check(await err(`INSERT INTO public.kiosk_pair_throttle (bucket, hits) VALUES (18, -1)`) === '23514', 'compteur négatif : refusé');
check(await err(`INSERT INTO public.kiosk_pair_throttle AS t (bucket, hits, window_start) VALUES (17, 1, now()) ON CONFLICT (bucket) DO UPDATE SET hits = t.hits + 1, window_start = EXCLUDED.window_start`) === null
  && (await one(`SELECT hits FROM public.kiosk_pair_throttle WHERE bucket = 17`)).hits === 2, 'service : l’écriture de la fonction (upsert du seau) marche');

section('Droits : la clé service lit, écrit et ne supprime jamais ; personne d’autre n’a rien');
await asService();
check(await err(`SELECT * FROM public.kiosk_pair_approvals`) === null && await err(`SELECT * FROM public.kiosk_pair_throttle`) === null, 'service : lit les deux tables');
check(await err(`DELETE FROM public.kiosk_pair_approvals WHERE rid_hash = $1`, [RID_HASH]) === '42501', 'service : DELETE des approbations refusé');
check(await err(`DELETE FROM public.kiosk_pair_throttle WHERE bucket = 17`) === '42501', 'service : DELETE du plafond refusé');
check(await err(`TRUNCATE public.kiosk_pair_approvals`) === '42501' && await err(`TRUNCATE public.kiosk_pair_throttle`) === '42501', 'service : TRUNCATE refusé');
check((await one(`SELECT count(*)::int AS n FROM public.kiosk_pair_approvals`)).n === 2, '… rien n’a disparu');
const WRITE = {
  kiosk_pair_throttle: `INSERT INTO public.kiosk_pair_throttle (bucket) VALUES (9)`,
  kiosk_pair_approvals: `INSERT INTO public.kiosk_pair_approvals (rid_hash, secret_hash, company_id, approved_by, approved_at)
    VALUES ('${'f'.repeat(64)}', '${SECRET_HASH}', '${CO}', '${ADMIN}', now())`,
};
for (const [label, uid, role] of [['administrateur (authenticated)', ADMIN, 'authenticated'], ['administrateur d’une autre entreprise', ADMIN2, 'authenticated'],
  ['salarié', LUCAS, 'authenticated'], ['anonyme', '', 'anon']]) {
  await as(uid, role);
  for (const t of NEW_TABLES) {
    check(await err(`SELECT * FROM public.${t}`) === '42501', `${label} : lecture de ${t} refusée (droit)`);
    check(await err(WRITE[t]) === '42501', `${label} : écriture dans ${t} refusée`);
    check(await err(`UPDATE public.${t} SET ${t === 'kiosk_pair_throttle' ? 'hits = 0' : 'claimed_at = now()'}`) === '42501', `${label} : mise à jour de ${t} refusée`);
    check(await err(`DELETE FROM public.${t}`) === '42501', `${label} : DELETE de ${t} refusé`);
  }
}
await root();
{
  const r = await rows(`SELECT t, p, role FROM unnest($1::text[]) t, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p, unnest(ARRAY['authenticated','anon']) role
    WHERE has_table_privilege(role, 'public.' || t, p)`, [NEW_TABLES]);
  check(r.length === 0, `tables neuves : aucun droit pour anon / authenticated malgré les droits par défaut (${r.map((x) => `${x.role}:${x.t}:${x.p}`).join(' ') || 'aucun'})`);
  const c = await rows(`SELECT t, role FROM unnest($1::text[]) t, unnest(ARRAY['authenticated','anon']) role
    WHERE has_any_column_privilege(role, 'public.' || t, 'SELECT,INSERT,UPDATE,REFERENCES')`, [NEW_TABLES]);
  check(c.length === 0, 'aucun droit par colonne non plus (anon, authenticated)');
  const sv = await rows(`SELECT t, p FROM unnest($1::text[]) t, unnest(ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('service_role', 'public.' || t, p)`, [NEW_TABLES]);
  check(sv.length === 0, `clé service : ni DELETE, ni TRUNCATE, ni REFERENCES, ni TRIGGER (${sv.map((x) => `${x.t}:${x.p}`).join(' ') || 'aucun'})`);
}

// ═══ Existant intact et croissance bornée ══════════════════════════════════
section('Existant intact après les écritures de test');
await root();
check((await one(`SELECT count(*)::int AS n FROM public.kiosks`)).n === 1 && (await one(`SELECT revoked_at IS NULL AS a FROM public.kiosks WHERE id = $1`, [TAB])).a === true, 'la tablette existante est toujours là et active');
check((await one(`SELECT count(*)::int AS n FROM public.kiosk_pair_failures`)).n === 1, 'kiosk_pair_failures (compteur du code à 6 chiffres) : intact, jamais touché');
check((await one(`SELECT count(*)::int AS n FROM public.kiosk_pair_throttle`)).n <= 4096, 'au plus 4 096 lignes de plafond');

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
check((await one(`SELECT to_regclass('public.kiosk_pair_approvals') IS NULL AND to_regclass('public.kiosk_pair_throttle') IS NULL AS gone`)).gone === true, 'les deux tables ont disparu');
const back = await prints();
check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.con === before.con
  && back.idx === before.idx && back.priv === before.priv && back.colpriv === before.colpriv && back.seq === before.seq && back.data === before.data,
  'après retour arrière : fonctions, policies, triggers, colonnes, contraintes, index, droits, séquences et données identiques à avant la migration');
{ const e = await errExec(SQL); check(!e, `la migration se recharge après le retour arrière${e ? ` — ${e}` : ''}`); }
{
  const v = await one(POST_SQL);
  check(Object.keys(v).length === 10 && Object.values(v).every((x) => x === true), 'vérification après application : de nouveau 10 × true');
}
check((await one(`SELECT count(*)::int AS n FROM public.kiosk_pair_approvals`)).n === 0, 'rechargée : tables neuves et vides');

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
