// Lot 12 — QR FIXE IMPRIMABLE + POSITION AU SCAN, rejoué POUR DE VRAI sur un
// Postgres jetable en mémoire (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:qr-fixe-db
//
// Même bouchon que les lots 11, 12 et 6 (fonctions et policies de PRODUCTION
// recopiées mot pour mot, relu depuis lot11_cloture_salarie.mjs). Les
// migrations des lots 1 (borne), 9, 11, 12 (pointage QR) et 0 sont chargées
// TELLES QUELLES, puis — avec les droits PAR DÉFAUT de production (tout pour
// anon / authenticated sur les objets neufs) — celle du QR fixe, DEUX fois ;
// puis son RETOUR ARRIÈRE (décommenté) est exécuté, et elle est rechargée.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const MIG_FILE = fs.readdirSync(path.join(here, '..', 'migrations')).find((f) => f.endsWith('_lot12_qr_fixe_position.sql'));
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
const SAM = '40000000-0000-0000-0000-000000000004'; // salarié de l'autre entreprise
const WS = 'e0000000-0000-0000-0000-000000000001', WS2 = 'e0000000-0000-0000-0000-000000000002';
const TAB = 'f0000000-0000-0000-0000-000000000001'; // tablette existante de CO
const TAB2 = 'f0000000-0000-0000-0000-000000000002'; // tablette existante de CO2

const EXTRA = `
CREATE TABLE public.planning (id uuid PRIMARY KEY, user_id uuid, work_date date, estimated_end time);
GRANT SELECT ON public.planning TO authenticated;
GRANT ALL ON public.planning TO service_role;
ALTER TABLE public.time_entries ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Paul', 'Martin'), ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${LUCAS}', '${CO}', 'worker', true, 'Lucas', 'Petit'), ('${SAM}', '${CO2}', 'worker', true, 'Sam', 'Sans');
INSERT INTO public.worksites VALUES ('${WS}', '${CO}'), ('${WS2}', '${CO2}');
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);
const db = new PGlite();
await db.exec(STUB);
await db.exec(EXTRA);
// L'existant, tel qu'en production : borne (lot 1), fin de pointage (9),
// clôture du salarié (11), pointage QR (12), fermeture de nuit (0).
await db.exec(mig('20260929090000_lot1_borne_pointage_qr.sql'));
await db.exec(mig('20261001120000_lot9_fin_pointage.sql'));
await db.exec(mig('20261002120000_lot11_cloture_salarie.sql'));
await db.exec(mig('20261003120000_lot12_pointage_qr.sql'));
await db.exec(mig('20261011090000_lot0_fermeture_pointages_oublies.sql'));
// En production, la clé service a tous les droits sur les tables du lot 1 (droits par défaut).
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  INSERT INTO public.kiosks (id, company_id, name, token_hash, seed_salt, created_at) VALUES
    ('${TAB}', '${CO}', 'Borne', 'h1', 's1', now() - interval '3 days'),
    ('${TAB2}', '${CO2}', 'Borne', 'h2', 's2', now() - interval '3 days');
  INSERT INTO public.kiosk_settings (company_id, active_from, active_until) VALUES ('${CO}', '06:00', '20:00');
  INSERT INTO public.kiosk_punches (company_id, kiosk_id, user_id, kind) VALUES ('${CO}', '${TAB}', '${LUCAS}', 'arrival');`);

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

/** Les lignes SQL commentées du fichier entre deux repères (comme les tests des lots 3, 4, 6 et 7). */
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
const NEW_COLS = ['kiosks.kind', 'kiosk_punches.in_zone', 'kiosk_settings.fixed_qr_latitude', 'kiosk_settings.fixed_qr_longitude',
  'kiosk_settings.fixed_qr_accuracy_m', 'kiosk_settings.fixed_qr_point_at', 'kiosk_settings.fixed_qr_radius_m'];
const NEW_TABLES = ['kiosk_ticket_failures'];
const NEW_CONS = ['kiosks_kind_check', 'kiosk_settings_fixed_qr_radius_check', 'kiosk_settings_fixed_qr_point_check'];

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
section('Migration : additive (aucun DROP ni DELETE exécuté), rejouable, droits repris');
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace`)).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND NOT ((table_name || '.' || column_name) = ANY($1)) AND NOT (table_name = ANY($2))`, [NEW_COLS, NEW_TABLES])).s;
const conPrint = async () => (await one(`SELECT string_agg(conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY conname) AS s
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT (conname = ANY($1)) AND conrelid <> coalesce(to_regclass('public.kiosk_ticket_failures'), 0)
    -- PostgreSQL 17 range aussi les NOT NULL dans pg_constraint : ceux des colonnes neuves ne comptent pas.
    AND NOT (contype = 'n' AND conname IN ('kiosks_kind_not_null', 'kiosk_settings_fixed_qr_radius_m_not_null'))`, [NEW_CONS])).s;
const idxPrint = async () => (await one(`SELECT string_agg(indexname || ':' || md5(indexdef), ',' ORDER BY indexname) AS s FROM pg_indexes
  WHERE schemaname = 'public' AND indexname NOT IN ('kiosks_one_fixed_qr_idx', 'kiosk_punches_in_zone_idx') AND NOT (tablename = ANY($1))`, [NEW_TABLES])).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT (c.relname = ANY($1)) ORDER BY 1, 2`, [NEW_TABLES]));
const colPrivPrint = async () => JSON.stringify(await rows(`SELECT table_name, column_name, r.rolname,
    has_column_privilege(r.rolname, 'public.' || table_name, column_name, 'SELECT') AS s,
    has_column_privilege(r.rolname, 'public.' || table_name, column_name, 'INSERT,UPDATE') AS w
  FROM information_schema.columns CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE table_schema = 'public' AND table_name LIKE 'kiosk%' AND NOT ((table_name || '.' || column_name) = ANY($1)) AND NOT (table_name = ANY($2))
  ORDER BY 1, 2, 3`, [NEW_COLS, NEW_TABLES]));
const seqPrint = async () => (await one(`SELECT coalesce(string_agg(relname, ',' ORDER BY relname), '') AS s FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace`)).s;
const prints = async () => ({ seq: await seqPrint(), fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(),
  idx: await idxPrint(), priv: await privPrint(), colpriv: await colPrivPrint() });
const before = await prints();
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
check(MIG_FILE === '20261011150000_lot12_qr_fixe_position.sql', `fichier ${MIG_FILE}`);
{
  // Contrôle automatique : hors commentaires, AUCUNE instruction DROP / DELETE
  // (ni TRUNCATE, RENAME, ALTER COLUMN, ALTER POLICY, UPDATE de données).
  const code = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const bad = code.match(/\b(DROP|DELETE|TRUNCATE|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|UPDATE\s+public\.)\b/gi) || [];
  check(bad.length === 0, `aucune instruction DROP / DELETE / TRUNCATE / RENAME / ALTER COLUMN / ALTER POLICY / UPDATE exécutée hors commentaires (${bad.join(', ') || 'aucune'})`);
  check(!/FOR\s+DELETE/i.test(code) && !/CREATE\s+POLICY/i.test(code), 'aucune policy neuve (ni « FOR DELETE » ni autre)');
  const head = SQL.split('\n').slice(0, 60).join('\n');
  check(/RETOUR ARRIÈRE/.test(head) && /VÉRIFICATION APRÈS APPLICATION/.test(head) && /HISTORIQUE/.test(head)
    && /INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\n--\s+VALUES \('20261011150000', 'lot12_qr_fixe_position'\) ON CONFLICT DO NOTHING;/.test(head),
    'en-tête : RETOUR ARRIÈRE, VÉRIFICATION APRÈS APPLICATION, HISTORIQUE (version et nom du fichier)');
}
{ const e = await errExec(SQL); check(!e, `migration chargée${e ? ` — ${e}` : ''}`); }
{ const e = await errExec(SQL); check(!e, `… une deuxième fois sans erreur (rejouable)${e ? ` — ${e}` : ''}`); }
const after = await prints();
check(before.seq === after.seq, `aucune séquence neuve (pas de colonne d’identité : rien à révoquer, rien d’ouvert à anon) — avant : « ${before.seq} »`);
check(before.fn === after.fn, 'fonctions existantes inchangées (company_kiosk_active, company_has_kiosk, kiosk_open_session, gardes…)');
check(before.pol === after.pol, 'policies existantes inchangées (kiosks_admin_read, kiosk_settings_admin_read…)');
check(before.trg === after.trg, 'triggers existants inchangés (aucun trigger ajouté)');
check(before.col === after.col, 'colonnes existantes inchangées (seules 7 colonnes neuves s’ajoutent)');
check(before.con === after.con, 'contraintes existantes inchangées (kiosk_punches.kiosk_id reste obligatoire)');
check(before.idx === after.idx, 'index existants inchangés');
check(before.priv === after.priv, 'droits des tables existantes inchangés');
check(before.colpriv === after.colpriv, 'droits par colonne existants inchangés (le bureau ne lit toujours ni le sel ni l’empreinte du jeton)');
check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 9 && bad.length === 0, `vérification après application : 9 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}

section('Existant : les tablettes restent des tablettes');
check((await rows(`SELECT kind FROM public.kiosks ORDER BY id`)).every((r) => r.kind === 'tablette'), 'tablettes existantes : kind = tablette');
check((await one(`SELECT fixed_qr_radius_m AS r, fixed_qr_latitude AS lat FROM public.kiosk_settings WHERE company_id = $1`, [CO])).r === 200, 'réglages existants : rayon 200 m par défaut, point non posé');
check((await one(`SELECT in_zone FROM public.kiosk_punches LIMIT 1`)).in_zone === null, 'pointages existants : in_zone vide (tablette)');
check((await one(`SELECT to_char(active_from, 'HH24:MI') AS f FROM public.kiosk_settings WHERE company_id = $1`, [CO])).f === '06:00', 'horaires d’ouverture existants intacts');

// ═══ Contrôles de la base ══════════════════════════════════════════════════
section('Contrôles de la base : un QR fixe actif par entreprise, rayon, point');
await asService();
const INS_FIXED = `INSERT INTO public.kiosks (company_id, name, token_hash, seed_salt, kind) VALUES ($1, 'QR fixe', 'x', 'fixe.sel', 'fixe') RETURNING id`;
const F1 = (await one(INS_FIXED, [CO])).id;
check(!!F1, 'service : QR fixe créé (ligne « fixe » de kiosks)');
check(await err(INS_FIXED, [CO]) === '23505', 'un deuxième QR fixe actif pour la même entreprise : refusé (index unique partiel)');
check(await err(INS_FIXED, [CO2]) === null, 'un QR fixe pour une autre entreprise : accepté');
check(await err(`INSERT INTO public.kiosks (company_id, name, token_hash, seed_salt) VALUES ($1, 'Borne 2', 'h', 's')`, [CO]) === null, 'une tablette de plus : jamais gênée par l’index');
check(await err(`INSERT INTO public.kiosks (company_id, name, token_hash, seed_salt, kind) VALUES ($1, 'x', 'h', 's', 'autre')`, [CO]) === '23514', 'kind inconnu : refusé');
check(await err(`UPDATE public.kiosk_settings SET fixed_qr_radius_m = 50 WHERE company_id = $1`, [CO]) === '23514', 'rayon 50 m : refusé');
check(await err(`UPDATE public.kiosk_settings SET fixed_qr_radius_m = 1001 WHERE company_id = $1`, [CO]) === '23514', 'rayon 1 001 m : refusé');
check(await err(`UPDATE public.kiosk_settings SET fixed_qr_radius_m = 500 WHERE company_id = $1`, [CO]) === null, 'rayon 500 m : accepté');
check(await err(`UPDATE public.kiosk_settings SET fixed_qr_latitude = 95, fixed_qr_longitude = 2, fixed_qr_accuracy_m = 10 WHERE company_id = $1`, [CO]) === '23514', 'latitude 95 : refusée');
check(await err(`UPDATE public.kiosk_settings SET fixed_qr_latitude = 45.75, fixed_qr_longitude = 4.83, fixed_qr_accuracy_m = 150 WHERE company_id = $1`, [CO]) === '23514', 'point précis à 150 m : refusé (100 m ou mieux)');
check(await err(`UPDATE public.kiosk_settings SET fixed_qr_latitude = 45.75, fixed_qr_longitude = NULL WHERE company_id = $1`, [CO]) === '23514', 'point à moitié posé : refusé');
check(await err(`UPDATE public.kiosk_settings SET fixed_qr_latitude = 45.75, fixed_qr_longitude = 4.83, fixed_qr_accuracy_m = 12, fixed_qr_point_at = now() WHERE company_id = $1`, [CO]) === null, 'point posé à ± 12 m : accepté');
check(await err(`INSERT INTO public.kiosk_punches (company_id, kiosk_id, user_id, kind, in_zone) VALUES ($1, $2, $3, 'arrival', true)`, [CO, F1, LUCAS]) === null, 'pointage du QR fixe : kiosk_id obligatoire respecté, in_zone = oui');
check(await err(`INSERT INTO public.kiosk_ticket_failures (bucket, failures) VALUES (17, 1)`) === null, 'service : un seau d’essais refusés s’enregistre (plafond de ticket)');
check(await err(`INSERT INTO public.kiosk_ticket_failures (bucket, failures) VALUES (17, 2)`) === '23505', '… une seule ligne par seau (la fonction la réécrit, elle n’en ajoute pas)');
check(await err(`INSERT INTO public.kiosk_ticket_failures (bucket) VALUES (4096)`) === '23514' && await err(`INSERT INTO public.kiosk_ticket_failures (bucket) VALUES (-1)`) === '23514', 'seau hors de 0 à 4 095 : refusé (au plus 4 096 lignes : la table ne grossit pas)');
check(await err(`INSERT INTO public.kiosk_ticket_failures (bucket, failures) VALUES (18, -1)`) === '23514', 'compteur négatif : refusé');
check(await err(`INSERT INTO public.kiosk_ticket_failures AS t (bucket, failures) VALUES (17, 1) ON CONFLICT (bucket) DO UPDATE SET failures = t.failures + 1, window_start = now()`) === null
  && (await one(`SELECT failures FROM public.kiosk_ticket_failures WHERE bucket = 17`)).failures === 2, 'service : l’écriture de la fonction (upsert du seau) marche');
{
  const cols = (await rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosk_ticket_failures' ORDER BY ordinal_position`)).map((r) => r.c);
  check(cols.join(',') === 'bucket,window_start,failures', `kiosk_ticket_failures : ni adresse IP, ni identifiant, ni jeton (${cols.join(', ')})`);
  check((await one(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'kiosk_punches_in_zone_idx'`)).indexdef.includes('WHERE (in_zone IS NOT NULL)'), 'index partiel de lecture du bureau : kiosk_punches_in_zone_idx');
}
{
  const cols = (await rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kiosk_punches' ORDER BY ordinal_position`)).map((r) => r.c);
  check(!cols.some((c) => /lat|lng|long|accuracy|position/i.test(c)), `kiosk_punches : aucune colonne de coordonnées (${cols.join(', ')})`);
}

// ═══ company_kiosk_active : le QR fixe compte comme un QR à scanner ═════════
section('Règle « la journée commence par un scan » : QR fixe compris, saisie à la main jamais bloquée');
const { today } = await one(`SELECT ((now() AT TIME ZONE 'Europe/Paris')::date)::text AS today`);
await root();
await db.query(`UPDATE public.companies SET kiosk_enabled = true WHERE id = $1`, [CO]);
await db.query(`UPDATE public.kiosks SET revoked_at = now() WHERE company_id = $1 AND kind = 'tablette'`, [CO]);
await as(LUCAS);
check((await one(`SELECT public.company_has_kiosk() AS v`)).v === true, 'QR fixe seul (tablettes retirées) : company_has_kiosk() = oui → icône du scanner chez le salarié');
check(await err(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, $4::date)`, [LUCAS, CO, WS, today]) === 'P0001',
  '… le téléphone ne commence pas la journée sans scan (même règle qu’avec la tablette)');
check(await err(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '08:00', '12:00', 'draft')`, [CO, LUCAS, WS, today]) === null,
  '… la saisie à la main (« + ») reste toujours possible');
await asService();
check(await err(`SELECT public.kiosk_open_session($1, $2, NULL, $3::date)`, [LUCAS, WS, today]) === null, 'scan du QR fixe (fonction kiosk) : le chrono démarre par kiosk_open_session');
await root();
check((await one(`SELECT source FROM public.active_sessions WHERE user_id = $1`, [LUCAS])).source === 'qr', '… marqué QR comme avec la tablette');
await db.query(`UPDATE public.kiosks SET revoked_at = now() WHERE id = $1`, [F1]);
await as(LUCAS);
check((await one(`SELECT public.company_has_kiosk() AS v`)).v === false, 'QR fixe désactivé (revoked_at) : company_has_kiosk() = non aussitôt');
await asService();
check((await one(INS_FIXED, [CO])).id, 'régénéré : un nouveau QR fixe actif (l’ancien reste, retiré)');
await root();
check(Number((await one(`SELECT count(*) AS n FROM public.kiosks WHERE company_id = $1 AND kind = 'fixe'`, [CO])).n) === 2, '… rien n’est effacé : 2 lignes « fixe », une seule active');

// ═══ Droits ════════════════════════════════════════════════════════════════
section('Droits : bureau (son entreprise), salarié, autre entreprise, anonyme');
await as(ADMIN);
{
  const r = await rows(`SELECT id, kind FROM public.kiosks ORDER BY created_at`);
  check(r.length >= 3 && r.every((x) => x.kind) && !r.some((x) => x.id === TAB2), `bureau : lit le type de SES bornes (${r.length}), pas celles de l’autre entreprise`);
  check(await err(`SELECT seed_salt FROM public.kiosks`) === '42501' && await err(`SELECT token_hash FROM public.kiosks`) === '42501', 'bureau : ni le sel ni l’empreinte du jeton');
  const s = await one(`SELECT fixed_qr_radius_m AS r, fixed_qr_accuracy_m AS a FROM public.kiosk_settings`);
  check(s?.r === 500 && s.a === 12, 'bureau : lit le rayon et la précision du point de SON entreprise');
  check(await err(`UPDATE public.kiosks SET kind = 'tablette'`) === '42501', 'bureau : ne change pas le type (écritures par la fonction kiosk seulement)');
  check(await err(`INSERT INTO public.kiosks (company_id, name, token_hash, seed_salt, kind) VALUES ($1, 'x', 'h', 's', 'fixe')`, [CO]) === '42501', 'bureau : ne crée pas de QR fixe en direct');
  check(await err(`UPDATE public.kiosk_settings SET fixed_qr_radius_m = 1000`) === '42501', 'bureau : ne change pas le rayon en direct');
  check(await err(`SELECT * FROM public.kiosk_ticket_failures`) === '42501' && await err(`INSERT INTO public.kiosk_ticket_failures (bucket) VALUES (1)`) === '42501' && await err(`UPDATE public.kiosk_ticket_failures SET failures = 0`) === '42501', 'bureau : aucun accès aux essais refusés');
  check(await err(`SELECT in_zone FROM public.kiosk_punches`) === '42501', 'bureau : kiosk_punches reste sans accès client (comme avant)');
}
await as(LUCAS);
check((await rows(`SELECT kind FROM public.kiosks`)).length === 0, 'salarié : ne lit aucune borne');
check((await rows(`SELECT fixed_qr_latitude FROM public.kiosk_settings`)).length === 0, 'salarié : ne lit pas le point de référence');
check(await err(`SELECT * FROM public.kiosk_ticket_failures`) === '42501' && await err(`UPDATE public.kiosk_ticket_failures SET failures = 0`) === '42501', 'salarié : aucun accès aux essais refusés');
check(await err(`UPDATE public.kiosk_punches SET in_zone = true`) === '42501', 'salarié : ne pose pas « dans la zone »');
await as(ADMIN2);
check(!(await rows(`SELECT id FROM public.kiosks`)).some((x) => x.id === F1 || x.id === TAB), 'bureau d’une autre entreprise : ne voit pas les bornes ni le QR fixe de CO');
check((await rows(`SELECT company_id FROM public.kiosk_settings WHERE company_id = $1`, [CO])).length === 0, 'bureau d’une autre entreprise : ne lit pas le point de CO');
await as(SAM);
check((await one(`SELECT public.company_has_kiosk() AS v`)).v === false, 'autre entreprise : son QR fixe ne compte pas tant que BEMEXO n’a pas allumé sa borne (kiosk_enabled)');
await root();
await db.query(`UPDATE public.companies SET kiosk_enabled = true WHERE id = $1`, [CO2]);
await db.query(`UPDATE public.kiosks SET revoked_at = now() WHERE company_id = $1 AND kind = 'tablette'`, [CO2]);
await as(SAM);
check((await one(`SELECT public.company_has_kiosk() AS v`)).v === true, '… allumée : son propre QR fixe compte (le sien, pas celui de CO)');
await as('', 'anon');
check(await err(`SELECT kind FROM public.kiosks`) === '42501', 'anon : kiosks refusé');
check(await err(`SELECT fixed_qr_latitude FROM public.kiosk_settings`) === '42501', 'anon : kiosk_settings refusé');
check(await err(`SELECT * FROM public.kiosk_ticket_failures`) === '42501' && await err(`INSERT INTO public.kiosk_ticket_failures (bucket) VALUES (2)`) === '42501' && await err(`UPDATE public.kiosk_ticket_failures SET failures = 0`) === '42501', 'anon : essais refusés inaccessibles');
check(await err(`SELECT public.company_has_kiosk()`) === '42501', 'anon : company_has_kiosk refusé (inchangé)');
await root();
{
  const r = await rows(`SELECT t, p, role FROM unnest($1::text[]) t, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p, unnest(ARRAY['authenticated','anon']) role
    WHERE has_table_privilege(role, 'public.' || t, p)`, [NEW_TABLES]);
  check(r.length === 0, `table neuve : aucun droit pour anon / authenticated malgré les droits par défaut (${r.map((x) => `${x.role}:${x.t}:${x.p}`).join(' ') || 'aucun'})`);
}

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
const back = await prints();
check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.con === before.con
  && back.idx === before.idx && back.priv === before.priv && back.colpriv === before.colpriv,
  'après retour arrière : fonctions, policies, triggers, colonnes, contraintes, index et droits identiques à avant la migration');
await as(LUCAS);
check((await one(`SELECT public.company_has_kiosk() AS v`)).v === false, 'après retour arrière : le QR fixe a été coupé avant (ne compte plus comme une borne)');
await root();
check(Number((await one(`SELECT count(*) AS n FROM public.kiosk_punches`)).n) === 2, '… les pointages restent (rien n’est effacé)');
{ const e = await errExec(SQL); check(!e, `la migration se recharge après le retour arrière${e ? ` — ${e}` : ''}`); }
{
  const v = await one(POST_SQL);
  check(Object.keys(v).length === 9 && Object.values(v).every((x) => x === true), 'vérification après application : de nouveau 9 × true');
}
check((await rows(`SELECT kind FROM public.kiosks`)).every((r) => r.kind === 'tablette'), 'rechargée : les anciennes lignes (retirées) sont vues comme tablettes retirées, sans effet');

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
