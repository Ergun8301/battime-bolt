// Vidéos de formation : envoi direct (lot 13, oct. 2026). Rejoué POUR DE VRAI
// sur un Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:videos-db
//
// Même bouchon que les lots 6, 11 et 12 (fonctions et policies de PRODUCTION
// recopiées mot pour mot), plus :
//   · le schéma `storage` (buckets, objects avec RLS, foldername) et les TROIS
//     policies de chantier-docs, relues dans leur migration d'origine ;
//   · le lot 6 (formations) appliqué tel quel, comme en production ;
//   · les droits PAR DÉFAUT de production (tout pour anon / authenticated sur
//     les objets neufs), pour prouver que la migration les reprend.
// Le stockage est simulé comme le fait Supabase : la VÉRIFICATION d'un envoi
// (et de la création d'une URL d'envoi signée) est un INSERT dans
// storage.objects avec les droits de l'utilisateur, annulé aussitôt ; l'envoi
// TERMINÉ écrit la ligne avec les droits du service (taille et type dans
// metadata). Les limites du bucket (50 Mo, types) sont appliquées par le
// serveur de stockage, pas par Postgres : on vérifie qu'elles sont posées.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, '..', 'migrations');
const mig = (f) => fs.readFileSync(path.join(migDir, f), 'utf8');
const MIG_FILE = fs.readdirSync(migDir).find((f) => f.endsWith('_lot13_videos_envoi_direct.sql'));
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
const ADMIN_B = 'a0000000-0000-0000-0000-00000000000c'; // deuxième compte bureau, MÊME entreprise
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b'; // bureau d'une AUTRE entreprise
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const ANCIEN = '60000000-0000-0000-0000-000000000006'; // salarié archivé
const AUTRE = '70000000-0000-0000-0000-000000000007'; // salarié de l'autre entreprise
const WS = 'e0000000-0000-0000-0000-000000000001', WS2 = 'e0000000-0000-0000-0000-000000000002';
const MO = 1024 * 1024;

// Le schéma storage de Supabase (colonnes utiles), RLS active, droits comme en production.
const STORAGE = `
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, owner uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false, avif_autodetection boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[], owner_id text);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text COLLATE "C",
  owner uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb, version text, owner_id text, user_metadata jsonb, UNIQUE (bucket_id, name));
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE
  AS $$ DECLARE _parts text[]; BEGIN SELECT string_to_array(name, '/') INTO _parts; RETURN _parts[1:array_length(_parts, 1) - 1]; END $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;
`;
// Le bucket chantier-docs et ses trois policies, relus dans la migration d'origine.
const CHANTIER = mig('20260625160000_chantier_documents.sql');
const CHANTIER_STORAGE = CHANTIER.slice(CHANTIER.indexOf('INSERT INTO storage.buckets'));

const EXTRA = `
-- La table documents de PRODUCTION (colonnes et quatre policies, comme le test du lot 6).
CREATE TABLE public.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  worksite_id uuid NOT NULL REFERENCES public.worksites(id) ON DELETE CASCADE, uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  label text, file_path text NOT NULL, file_name text, mime_type text, size_bytes bigint, created_at timestamptz NOT NULL DEFAULT now(),
  work_date date, time_entry_id uuid, photo_no integer, category text);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.documents TO authenticated;
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id() AND uploaded_by = auth.uid());
CREATE POLICY documents_delete ON public.documents FOR DELETE TO authenticated USING (company_id = public.get_my_company_id() AND (public.is_admin() OR uploaded_by = auth.uid()));
CREATE POLICY support_read ON public.documents FOR SELECT TO authenticated USING (company_id = ANY (public.support_company_ids()));
GRANT SELECT ON public.users, public.companies TO authenticated;
ALTER TABLE public.worksites ADD COLUMN client_name text;
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'), ('${ADMIN_B}', '${CO}', 'admin', true, 'Bureau', 'Deux'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'), ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Test'), ('${ANCIEN}', '${CO}', 'worker', false, 'Ancien', 'Test'),
  ('${AUTRE}', '${CO2}', 'worker', true, 'Autre', 'Salarié');
INSERT INTO public.worksites (id, company_id, client_name) VALUES ('${WS}', '${CO}', 'Villa Exemple'), ('${WS2}', '${CO2}', 'Autre');
-- Un document de chantier et son fichier : ils ne doivent pas bouger.
INSERT INTO public.documents (company_id, worksite_id, uploaded_by, label, file_path, file_name, mime_type) VALUES
  ('${CO}', '${WS}', '${ADMIN}', 'Livret sécurité', '${CO}/${WS}/a.pdf', 'livret.pdf', 'application/pdf');
INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('chantier-docs', '${CO}/${WS}/a.pdf', '${ADMIN}', '{"size": 120000, "mimetype": "application/pdf"}');
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);
const db = new PGlite();
await db.exec(STUB);
await db.exec(STORAGE);
await db.exec(CHANTIER_STORAGE);
await db.exec(EXTRA);
await db.exec(mig('20261010210000_lot6_formations.sql'));

const as = async (uid, role = 'authenticated') => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`SET ROLE ${role}`);
};
const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); };
const errOf = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return { code: e.code || '', msg: e.message }; } };
const err = async (sql, p = []) => (await errOf(sql, p))?.code ?? null;
const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];
const count = async (sql, p = []) => Number((await one(sql, p)).n);
/** Ce que fait le serveur de stockage AVANT d'accepter un envoi (ou de signer une URL d'envoi) : un INSERT d'essai, annulé. */
const canUpload = async (uid, name, bucket = 'formations', role = 'authenticated') => {
  await as(uid, role);
  try {
    await db.exec('BEGIN');
    await db.query(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, $3)`, [bucket, name, uid]);
    return true;
  } catch { return false; } finally { await db.exec('ROLLBACK'); }
};
/** L'envoi terminé (URL signée) : le serveur de stockage écrit la ligne avec ses propres droits. */
const landed = async (name, bytes, mime = 'video/webm') => {
  await root();
  await db.query(`INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('formations', $1, $2, $3)`,
    [name, ADMIN, JSON.stringify({ size: bytes, mimetype: mime, eTag: 'x' })]);
};
/** Lien signé de lecture : le stockage lit la ligne avec les droits de l'utilisateur. */
const canRead = async (uid, name) => { await as(uid); return (await rows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'formations' AND name = $1`, [name])).length === 1; };
const START = `SELECT * FROM public.start_training_video($1, $2, $3::uuid[], $4, $5::bigint, $6)`;
const start = async (uid, x = {}) => {
  await as(uid);
  return one(START, [x.title ?? 'Consignes harnais', x.all ?? true, x.ids ?? '{}', x.mime ?? 'video/webm', x.size ?? 10 * MO, x.dur ?? 42]);
};
const startErr = async (uid, x = {}) => {
  await as(uid);
  return errOf(START, [x.title ?? 'Consignes harnais', x.all ?? true, x.ids ?? '{}', x.mime ?? 'video/webm', x.size ?? 10 * MO, x.dur ?? 42]);
};
const limits = async (uid) => { await as(uid); const l = await one('SELECT * FROM public.training_video_limits()'); return Object.fromEntries(Object.entries(l).map(([k, v]) => [k, Number(v)])); };
const publish = async (uid, id) => { await as(uid); return one('SELECT * FROM public.publish_training_video($1)', [id]); };
const myVideos = async (uid) => { await as(uid); return rows('SELECT * FROM public.my_training_videos()'); };

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
const NEW_TABLES = ['training_videos', 'training_video_views'];
const NEW_FNS = ['training_video_quota_bytes', 'training_video_max_bytes', 'training_video_usage', 'training_video_upload_ok', 'training_video_readable',
  'training_video_limits', 'start_training_video', 'publish_training_video', 'set_training_video_archived', 'my_training_videos', 'set_training_video_seen'];
const NEW_POLICIES = ['formations_office_insert', 'formations_read', 'training_videos_office_select', 'training_video_views_select'];

// ═══ Avant : l'application d'aujourd'hui ════════════════════════════════════
section('Avant la migration : rien du lot n’existe (l’application se cache)');
{
  const r = await one(`SELECT to_regclass('public.training_videos') IS NULL AS t, (SELECT count(*) FROM pg_proc WHERE proname = ANY($1))::int AS f,
    (SELECT count(*) FROM storage.buckets WHERE id = 'formations')::int AS b`, [NEW_FNS]);
  check(r.t && r.f === 0 && r.b === 0, 'ni table, ni fonction, ni bucket « formations » (PGRST205 / PGRST202 côté appli)');
  await as(ADMIN);
  const t = await one(`INSERT INTO public.trainings (company_id, title, kind, video_url, document_id, all_team, assignee_ids) VALUES ($1, 'Port du harnais', 'video', 'https://youtu.be/abc', null, true, '{}') RETURNING id`, [CO]);
  await as(SAM);
  check((await rows('SELECT id FROM public.my_trainings()')).some((x) => x.id === t.id), 'lot 6 : une formation YouTube arrive chez Sam (référence avant / après)');
}

// ═══ La migration : additive, sans DROP ni DELETE, rejouable ════════════════
section('Migration : additive, aucun DROP ni DELETE exécuté, rejouable, droits repris');
const fnPrint = async () => (await one(`SELECT string_agg(n.nspname || '.' || p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' ORDER BY n.nspname, p.proname) AS s
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public', 'storage', 'auth') AND NOT (p.proname = ANY($1))`, [NEW_FNS])).s;
const polPrint = async () => (await one(`SELECT string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY schemaname, tablename, policyname) AS s
  FROM pg_policies WHERE NOT (policyname = ANY($1))`, [NEW_POLICIES])).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_schema || '.' || table_name || '.' || column_name || ':' || data_type || ':' || coalesce(column_default, '') || ':' || is_nullable, ',' ORDER BY table_schema, table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema IN ('public', 'storage') AND NOT (table_name = ANY($1))`, [NEW_TABLES])).s;
const conPrint = async () => (await one(`SELECT string_agg(conrelid::regclass::text || '.' || conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY 1) AS s
  FROM pg_constraint WHERE connamespace IN ('public'::regnamespace, 'storage'::regnamespace) AND NOT (conrelid::regclass::text = ANY($1))`, [NEW_TABLES.map((t) => `training_videos` === t ? 'training_videos' : t)])).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relnamespace::regnamespace::text AS s, c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE c.relnamespace IN ('public'::regnamespace, 'storage'::regnamespace) AND c.relkind = 'r' AND NOT (c.relname = ANY($1)) ORDER BY 1, 2, 3`, [NEW_TABLES]));
const dataPrint = async () => JSON.stringify(await rows(`SELECT (SELECT json_agg(b ORDER BY id) FROM (SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id <> 'formations') b) AS b,
  (SELECT json_agg(o ORDER BY name) FROM (SELECT bucket_id, name, metadata FROM storage.objects WHERE bucket_id <> 'formations') o) AS o,
  (SELECT json_agg(t ORDER BY id) FROM public.trainings t) AS t, (SELECT json_agg(d ORDER BY id) FROM public.documents d) AS d`));
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(), priv: await privPrint(), data: await dataPrint() });
await root();
const before = await prints();
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
check(/^20261011160000_lot13_videos_envoi_direct\.sql$/.test(MIG_FILE) && MIG_FILE > '20261011090000_lot0_fermeture_pointages_oublies.sql', `fichier ${MIG_FILE} (après le lot 0)`);
{
  // Contrôle automatique : le code (lignes hors commentaires, corps de fonctions et blocs DO compris).
  const code = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).map((l) => l.replace(/\s--\s.*$/, '')).join('\n');
  const found = (re) => (code.match(re) || []).length;
  check(found(/\bDROP\b/gi) === 0, 'aucun DROP exécuté (ni table, ni fonction, ni policy, ni trigger)');
  check(found(/\bDELETE\s+FROM\b/gi) === 0 && found(/\bFOR\s+DELETE\b/gi) === 0 && found(/\bTRUNCATE\b/gi) === 0,
    'aucun DELETE exécuté, aucune policy « FOR DELETE », aucun TRUNCATE (corps de fonctions compris)');
  const deletes = code.match(/\bDELETE\b/gi) || [];
  const refs = code.match(/\bON DELETE (CASCADE|SET NULL)\b/gi) || [];
  check(deletes.length === refs.length, `le mot DELETE n’apparaît que dans des clés étrangères « ON DELETE CASCADE / SET NULL » des tables neuves (${refs.length})`);
  const alters = code.match(/\bALTER\s+\w+[^;]*/gi) || [];
  check(alters.length === 2 && alters.every((a) => /^ALTER TABLE public\.(training_videos|training_video_views) ENABLE ROW LEVEL SECURITY$/.test(a.trim())),
    `ALTER : seulement « ENABLE ROW LEVEL SECURITY » sur les 2 tables neuves (${alters.map((a) => a.trim()).join(' ; ')})`);
  check(!/\bRENAME\b/i.test(code) && !/\bUPDATE\s+(storage|public)\.(?!training_video)/i.test(code), 'aucun RENAME ; aucune mise à jour d’une table existante');
  const inserts = [...code.matchAll(/\bINSERT\s+INTO\s+([\w.]+)/gi)].map((m) => m[1]);
  check(inserts.every((t) => ['storage.buckets', 'public.training_videos', 'public.training_video_views'].includes(t)),
    `INSERT : le bucket neuf et les tables neuves seulement (${[...new Set(inserts)].join(', ')})`);
  check(/INSERT INTO storage\.buckets[^;]*ON CONFLICT \(id\) DO NOTHING;/.test(code), 'bucket : ON CONFLICT DO NOTHING (rien n’est changé s’il existe)');
  const pols = [...code.matchAll(/CREATE POLICY (\w+)/g)].map((m) => m[1]);
  check(pols.length === 4 && pols.every((p) => new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_policies WHERE[^)]*policyname = '${p}'\\) THEN\\s+CREATE POLICY ${p}`).test(code)),
    'les 4 policies sont créées seulement si elles manquent (bloc DO + pg_policies)');
  check(/^-- RETOUR ARRIÈRE/m.test(SQL.slice(0, 400)) && SQL.indexOf('-- VÉRIFICATION APRÈS APPLICATION') < SQL.indexOf('-- HISTORIQUE') && SQL.indexOf('-- HISTORIQUE') < SQL.indexOf('\nINSERT INTO storage.buckets'),
    'en-tête : RETOUR ARRIÈRE, VÉRIFICATION APRÈS APPLICATION, HISTORIQUE, avant le code');
  check(/INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\n--\s+VALUES \('20261011160000', 'lot13_videos_envoi_direct'\) ON CONFLICT DO NOTHING;/.test(SQL),
    'HISTORIQUE : version et nom du fichier, ON CONFLICT DO NOTHING');
}
await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
await root();
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (lot 6, get_my_company_id, is_admin, storage.foldername…)');
check(before.pol === after.pol, 'policies existantes inchangées (chantier-docs, documents, trainings, time_entries…)');
check(before.trg === after.trg, 'triggers inchangés (aucun ajouté)');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée sur les tables existantes (public et storage)');
check(before.con === after.con, 'contraintes existantes inchangées (trainings_source, trainings_video_url_check… : D10)');
check(before.priv === after.priv, 'droits des tables existantes inchangés');
check(before.data === after.data, 'données existantes inchangées (buckets, fichiers, formations, documents)');
check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 11 && bad.length === 0, `vérification après application : 11 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
  const b = await one(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'formations'`);
  check(b && b.public === false && Number(b.file_size_limit) === 50 * MO && JSON.stringify(b.allowed_mime_types) === '["video/mp4","video/quicktime","video/webm"]',
    'bucket « formations » : privé, 52428800 octets (50 Mo), MP4 / MOV / WebM seulement');
  const fns = await one(`SELECT count(*)::int AS n, bool_and(prosecdef) AS d, bool_and(array_to_string(proconfig, ',') = 'search_path=""') AS s,
    bool_or(has_function_privilege('anon', oid, 'EXECUTE')) AS a FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [NEW_FNS]);
  check(fns.n === 11 && fns.d && fns.s && !fns.a, '11 fonctions : SECURITY DEFINER, search_path vide, anon exclu (malgré les droits par défaut)');
  const internal = await rows(`SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1) AND has_function_privilege('authenticated', oid, 'EXECUTE') ORDER BY 1`,
    [['training_video_usage', 'training_video_max_bytes', 'training_video_quota_bytes']]);
  check(internal.length === 0, 'compteur interne (usage d’une entreprise au choix) : fermé au navigateur');
}

// ═══ Anonyme ════════════════════════════════════════════════════════════════
section('Anonyme : rien');
{
  await as(null, 'anon');
  check(await err('SELECT * FROM public.training_videos') === '42501', 'anon : lecture des vidéos refusée');
  check(await err('SELECT * FROM public.training_video_views') === '42501', 'anon : lecture des « Vue » refusée');
  for (const q of ['SELECT * FROM public.training_video_limits()', 'SELECT * FROM public.my_training_videos()', `SELECT public.set_training_video_seen('${CO}')`,
    `SELECT * FROM public.start_training_video('Titre', true, '{}', 'video/webm', 10, 1)`, `SELECT * FROM public.publish_training_video('${CO}')`]) {
    check(await err(q) === '42501', `anon : ${q.slice(0, 50)}… refusé`);
  }
  check(!(await canUpload(null, `${CO}/x`, 'formations', 'anon')), 'anon : aucun envoi dans le bucket');
}

// ═══ Salarié : aucune écriture, rien à lire au bureau ═══════════════════════
section('Salarié et chef d’équipe : aucune écriture, pas d’accès bureau');
{
  for (const who of [SAM, CHEF]) {
    const e = await startErr(who);
    check(e?.code === '42501' && /Réservé au bureau/.test(e.msg), `${who === SAM ? 'salarié' : 'chef d’équipe'} : réserver un envoi refusé (« ${e?.msg} »)`);
  }
  await as(SAM);
  check(await err('SELECT * FROM public.training_video_limits()') === '42501', 'salarié : la jauge du bureau est refusée');
  check(await err(`INSERT INTO public.training_videos (company_id, title, file_path, mime_type, declared_bytes) VALUES ($1, 'Pirate', 'x', 'video/mp4', 1)`, [CO]) === '42501',
    'salarié : insertion directe dans training_videos refusée (aucun droit)');
  check(await err(`INSERT INTO public.training_video_views (video_id, user_id, company_id) VALUES ($1, $2, $3)`, [CO, SAM, CO]) === '42501', 'salarié : « Vue » directe refusée (fonction seulement)');
  check(!(await canUpload(SAM, `${CO}/00000000-0000-0000-0000-000000000000`)), 'salarié : aucun envoi dans le bucket');
}

// ═══ Bureau : contrôles de la réservation ═══════════════════════════════════
section('Bureau : la base contrôle titre, type, taille et destinataires');
{
  const cases = [
    [{ title: 'x' }, '22023', /Titre/], [{ mime: 'image/png' }, '22023', /Format refusé/], [{ mime: 'application/pdf' }, '22023', /Format refusé/],
    [{ size: 0 }, '22023', /vide/], [{ size: 50 * MO + 1 }, '22023', /Vidéo trop lourde : 50 Mo maximum/],
    [{ all: false, ids: '{}' }, '22023', /au moins un salarié/], [{ all: false, ids: `{${AUTRE}}` }, '42501', /introuvable/],
    [{ all: false, ids: `{${ANCIEN}}` }, '42501', /introuvable/], [{ all: false, ids: `{${ADMIN_B}}` }, '42501', /introuvable/],
  ];
  for (const [x, code, re] of cases) {
    const e = await startErr(ADMIN, x);
    check(e?.code === code && re.test(e.msg), `refusé (${code}) : ${JSON.stringify(x)} → « ${e?.msg} »`);
  }
  check(Number((await one('SELECT count(*) n FROM public.training_videos')).n) === 0, '… aucune place réservée par ces refus');
}

// ═══ Le parcours complet ════════════════════════════════════════════════════
section('Parcours : réserver → URL d’envoi (policy) → envoi → publier');
let V1;
{
  const s = await start(ADMIN, { title: '  Consignes   harnais ', size: 40 * MO, dur: 95 });
  V1 = s.video_id;
  check(s.video_path === `${CO}/${V1}` && s.uploaded === false, `place « {entreprise}/{uuid} » réservée (${s.video_path})`);
  await root();
  const row = await one('SELECT * FROM public.training_videos WHERE id = $1', [V1]);
  check(row.title === 'Consignes harnais' && row.created_by === ADMIN && row.published_at === null && Number(row.declared_bytes) === 40 * MO && row.duration_s === 95,
    'ligne : titre nettoyé, auteur = le bureau, pas publiée, taille annoncée, durée');
  let l = await limits(ADMIN);
  check(l.max_file_bytes === 50 * MO && l.quota_bytes === 100 * MO && l.used_bytes === 0 && l.reserved_bytes === 40 * MO, `jauge : 0 utilisé, 40 Mo en cours, 50 Mo par fichier, 100 Mo en tout (${JSON.stringify(l)})`);
  check(await canUpload(ADMIN, s.video_path), 'bureau : URL d’envoi signée accordée pour SA place');
  check(!(await canUpload(ADMIN, `${CO}/11111111-1111-1111-1111-111111111111`)), 'bureau : refusée pour un autre chemin de son dossier');
  check(!(await canUpload(ADMIN, `${CO2}/${V1}`)), 'bureau : refusée dans le dossier d’une autre entreprise');
  check(!(await canUpload(ADMIN_B, s.video_path)), 'autre compte du bureau : refusée sur une place qui n’est pas la sienne');
  check(!(await canUpload(ADMIN2, s.video_path)), 'bureau d’une autre entreprise : refusée');
  check(!(await canUpload(SAM, s.video_path)), 'salarié : refusée');
  check(await canUpload(ADMIN, `${CO}/${WS}/b.pdf`, 'chantier-docs') && await canUpload(SAM, `${CO}/${WS}/c.pdf`, 'chantier-docs'), 'chantier-docs : envois de documents inchangés (bureau et salarié)');
  const eB = await startErr(ADMIN_B);
  check(eB?.code === 'P0001' && /Une autre vidéo est en cours d’envoi|Une autre vidéo est en cours d'envoi/.test(eB.msg), `un seul envoi ouvert par entreprise : l’autre compte du bureau attend (« ${eB?.msg} »)`);
  // « Annuler », puis on recommence avec un autre fichier : MÊME place, comptée une fois.
  const again = await start(ADMIN, { title: 'Consignes harnais', size: 30 * MO, dur: 80 });
  check(again.video_id === V1 && again.video_path === s.video_path && again.uploaded === false, 'recommencer après « Annuler » : la même place est reprise (jamais deux fichiers)');
  l = await limits(ADMIN);
  check(l.reserved_bytes === 30 * MO, `… comptée une seule fois, à la nouvelle taille (${l.reserved_bytes / MO} Mo)`);
  check(await err('SELECT * FROM public.publish_training_video($1)', [V1]) === 'P0001', 'publier avant l’arrivée du fichier : refusé (« pas arrivée »)');
  await landed(s.video_path, 30 * MO, 'video/webm');
  const p = await publish(ADMIN, V1);
  check(p.video_id === V1 && Number(p.real_bytes) === 30 * MO, 'publiée : la VRAIE taille vient du stockage');
  check(Number((await publish(ADMIN, V1)).real_bytes) === 30 * MO, 'publier deux fois : même résultat (rien de neuf)');
  l = await limits(ADMIN);
  check(l.used_bytes === 30 * MO && l.reserved_bytes === 0, `jauge : 30 Mo utilisés, rien en cours (${l.used_bytes / MO} / ${l.reserved_bytes / MO})`);
  check(!(await canUpload(ADMIN, s.video_path)), 'vidéo publiée : plus aucun envoi sur sa place (pas d’écrasement)');
  await as(ADMIN);
  check(await err(`UPDATE storage.objects SET metadata = '{}' WHERE bucket_id = 'formations'`) === null
    && Number((await one(`SELECT count(*) n FROM storage.objects WHERE bucket_id = 'formations' AND metadata = '{}'`)).n) === 0, 'aucune policy UPDATE : le bureau ne peut pas modifier un fichier (0 ligne touchée)');
  await as(ADMIN);
  const del = await rows(`DELETE FROM storage.objects WHERE bucket_id = 'formations' RETURNING 1`).catch(() => []);
  await root();
  check(del.length === 0 && await count(`SELECT count(*) n FROM storage.objects WHERE bucket_id = 'formations'`) === 1, 'aucune policy DELETE : le bureau ne peut pas effacer une vidéo (D12)');
  check(await count(`SELECT count(*) n FROM public.training_videos WHERE id = $1 AND published_at IS NOT NULL AND mime_type = 'video/webm'`, [V1]) === 1, 'type repris du stockage');
  check((await startErr(ADMIN_B)) === null, 'la place publiée, l’autre compte du bureau peut envoyer à son tour');
}

// ═══ Lecture : qui voit quoi ════════════════════════════════════════════════
section('Lecture : le bureau et les destinataires seulement');
let V2, V2_PATH;
{
  await root();
  // Place de l'autre compte bureau (ouverte juste avant) : on la publie pour Alex seul.
  const sB = await start(ADMIN_B, { title: 'Habilitation nacelle', all: false, ids: `{${ALEX}}`, size: 20 * MO });
  V2 = sB.video_id; V2_PATH = sB.video_path;
  await landed(V2_PATH, 20 * MO, 'video/mp4');
  await publish(ADMIN_B, V2);
  const sam = await myVideos(SAM);
  check(sam.length === 1 && sam[0].id === V1 && sam[0].seen_at === null && Number(sam[0].size_bytes) === 30 * MO && sam[0].duration_s === 80 && sam[0].file_path === `${CO}/${V1}`,
    'Sam : la vidéo « toute l’équipe » (taille, durée, chemin), pas celle d’Alex seul');
  check((await myVideos(ALEX)).length === 2 && (await myVideos(CHEF)).length === 1, 'Alex : les 2 ; le chef d’équipe : celle de toute l’équipe');
  check((await myVideos(ADMIN)).length === 0 && (await myVideos(AUTRE)).length === 0 && (await myVideos(ANCIEN)).length === 0,
    'un compte bureau, un salarié d’une autre entreprise, un salarié archivé : aucune');
  check(await canRead(SAM, `${CO}/${V1}`) && await canRead(CHEF, `${CO}/${V1}`), 'lien signé : Sam et le chef lisent la vidéo de l’équipe');
  check(!(await canRead(SAM, V2_PATH)) && await canRead(ALEX, V2_PATH), 'lien signé : la vidéo d’Alex seul, refusée à Sam, accordée à Alex');
  check(await canRead(ADMIN, V2_PATH) && await canRead(ADMIN_B, `${CO}/${V1}`), 'lien signé : le bureau lit les vidéos de son entreprise');
  check(!(await canRead(ADMIN2, `${CO}/${V1}`)) && !(await canRead(AUTRE, `${CO}/${V1}`)) && !(await canRead(ANCIEN, `${CO}/${V1}`)), 'autre entreprise (bureau ou salarié), salarié archivé : refusé');
  await as(ADMIN2);
  check((await rows('SELECT id FROM public.training_videos')).length === 0, 'bureau d’une autre entreprise : ne voit aucune vidéo');
  check(await err('SELECT * FROM public.publish_training_video($1)', [V1]) === 'P0002', 'bureau d’une autre entreprise : ne peut pas publier (« introuvable »)');
  check(await err('SELECT public.set_training_video_archived($1, true)', [V1]) === 'P0002', 'bureau d’une autre entreprise : ne peut pas retirer');
  await as(SAM);
  check((await rows('SELECT id FROM public.training_videos')).length === 0, 'salarié : aucune ligne de la table (il passe par my_training_videos)');
  await as(ADMIN);
  check((await rows('SELECT id FROM public.training_videos')).length === 2, 'bureau : ses 2 vidéos');
  // La vidéo de chantier-docs reste lisible comme avant.
  await as(SAM);
  check((await rows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'chantier-docs'`)).length === 1, 'chantier-docs : Sam lit toujours les documents de son entreprise');
}

// ═══ « Vue » ════════════════════════════════════════════════════════════════
section('« Vue » : sa ligne seulement ; « Annuler » 10 min, sans rien effacer');
{
  await as(SAM);
  const d1 = (await one('SELECT public.set_training_video_seen($1, true) AS d', [V1])).d;
  check(!!d1, 'Sam coche « Vue »');
  check(String((await one('SELECT public.set_training_video_seen($1, true) AS d', [V1])).d) === String(d1), 'un second appel rend la même date');
  check((await myVideos(SAM))[0].seen_at !== null, 'my_training_videos : vue');
  await as(SAM);
  check((await one('SELECT public.set_training_video_seen($1, false) AS d', [V1])).d === null, '« Annuler » dans les 10 min : accepté');
  await root();
  const v = await one('SELECT seen_at, undone_at FROM public.training_video_views WHERE video_id = $1 AND user_id = $2', [V1, SAM]);
  check(!!v && v.undone_at !== null, '… la ligne RESTE, avec l’heure d’annulation (rien n’est effacé)');
  check((await myVideos(SAM))[0].seen_at === null, '… et Sam la voit « pas encore vue »');
  await as(SAM);
  await one('SELECT public.set_training_video_seen($1, true) AS d', [V1]);
  await root();
  check(await count('SELECT count(*) n FROM public.training_video_views WHERE video_id = $1 AND user_id = $2 AND undone_at IS NULL', [V1, SAM]) === 1, 'cochée de nouveau : une seule ligne, active');
  await db.query(`UPDATE public.training_video_views SET seen_at = now() - interval '11 minutes' WHERE video_id = $1 AND user_id = $2`, [V1, SAM]);
  await as(SAM);
  const late = await errOf('SELECT public.set_training_video_seen($1, false)', [V1]);
  check(late?.code === 'P0001' && /Trop tard/.test(late.msg), '« Annuler » après 10 min : refusé (« Trop tard »)');
  check(await err('SELECT public.set_training_video_seen($1, true)', [V2]) === 'P0002', 'Sam sur la vidéo d’Alex seul : refusé (« ne vous est pas destinée »)');
  await as(AUTRE);
  check(await err('SELECT public.set_training_video_seen($1, true)', [V1]) === 'P0002', 'salarié d’une autre entreprise : refusé');
  await as(ADMIN);
  check(await err('SELECT public.set_training_video_seen($1, true)', [V1]) === '42501', 'compte bureau : refusé (« réservé aux salariés »)');
  await as(ALEX);
  await one('SELECT public.set_training_video_seen($1, true)', [V1]);
  await as(ADMIN);
  check(await count('SELECT count(*) n FROM public.training_video_views WHERE undone_at IS NULL') === 2, 'bureau : lit les 2 « Vue » de son entreprise');
  await as(SAM);
  check((await rows('SELECT user_id FROM public.training_video_views')).every((r) => r.user_id === SAM), 'Sam : ne lit que ses propres « Vue »');
  await as(ADMIN2);
  check(await count('SELECT count(*) n FROM public.training_video_views') === 0, 'autre entreprise : aucune « Vue »');
}

// ═══ Retirer / remettre ════════════════════════════════════════════════════
section('« Retirer » : statut et trace ; le fichier et les « Vue » restent');
{
  await as(SAM);
  check(await err('SELECT public.set_training_video_archived($1, true)', [V1]) === '42501', 'salarié : retirer refusé');
  await as(ADMIN);
  const at = (await one('SELECT public.set_training_video_archived($1, true) AS a', [V1])).a;
  await root();
  const r = await one('SELECT archived_at, archived_by FROM public.training_videos WHERE id = $1', [V1]);
  check(!!at && r.archived_by === ADMIN, 'retirée : archived_at (heure du serveur) et archived_by = le bureau');
  check((await myVideos(SAM)).length === 0 && !(await canRead(SAM, `${CO}/${V1}`)), 'Sam : plus dans sa liste, lien de lecture refusé');
  await as(SAM);
  check(await err('SELECT public.set_training_video_seen($1, true)', [V1]) === 'P0002', 'Sam : « Vue » sur une vidéo retirée refusée');
  await root();
  check(await count('SELECT count(*) n FROM public.training_video_views WHERE video_id = $1', [V1]) === 2 && await count(`SELECT count(*) n FROM storage.objects WHERE name = $1`, [`${CO}/${V1}`]) === 1,
    'les « Vue » et le fichier restent (D12)');
  check((await limits(ADMIN)).used_bytes === 50 * MO, 'le fichier d’une vidéo retirée compte toujours (30 + 20 = 50 Mo)');
  await as(ADMIN);
  await one('SELECT public.set_training_video_archived($1, false) AS a', [V1]);
  check((await myVideos(SAM)).some((x) => x.id === V1 && x.seen_at !== null), 'remise : de nouveau chez Sam, avec sa « Vue » d’avant');
}

// ═══ Envois coupés, places abandonnées ══════════════════════════════════════
section('Réseau coupé après l’envoi, autre fichier, place abandonnée');
{
  // Réseau coupé APRÈS l'arrivée du fichier : même taille → on publie sans renvoyer.
  const s = await start(ADMIN, { title: 'Tri des déchets', size: 5 * MO });
  await landed(s.video_path, 5 * MO);
  const r = await start(ADMIN, { title: 'Tri des déchets', size: 5 * MO });
  check(r.video_id === s.video_id && r.uploaded === true, 'même fichier, déjà arrivé : uploaded = true, il reste à publier');
  await publish(ADMIN, s.video_id);
  // Un AUTRE fichier est arrivé sur la place : elle est fermée avec une trace, le fichier reste.
  const s2 = await start(ADMIN, { title: 'Rangement', size: 4 * MO });
  await landed(s2.video_path, 6 * MO);
  const r2 = await start(ADMIN, { title: 'Rangement', size: 3 * MO });
  await root();
  const old = await one('SELECT archived_at, archived_by, published_at FROM public.training_videos WHERE id = $1', [s2.video_id]);
  check(r2.video_id !== s2.video_id && old.archived_at !== null && old.archived_by === ADMIN && old.published_at === null,
    'autre fichier déjà arrivé : place fermée (archived_at, archived_by), nouvelle place');
  check(await count(`SELECT count(*) n FROM storage.objects WHERE name = $1`, [s2.video_path]) === 1, '… l’ancien fichier n’est PAS effacé (il compte dans le quota)');
  await as(ADMIN);
  check(await err('SELECT * FROM public.publish_training_video($1)', [s2.video_id]) === 'P0001', '… et cette place ne peut plus être publiée');
  // Place abandonnée (onglet fermé) depuis plus de 3 h : ne bloque plus, ne compte plus.
  await root();
  await db.query(`UPDATE public.training_videos SET reserved_at = now() - interval '4 hours' WHERE id = $1`, [r2.video_id]);
  check(!(await canUpload(ADMIN, r2.video_path)), 'URL d’envoi : refusée plus de 15 min après la réservation');
  const l = await limits(ADMIN);
  check(l.reserved_bytes === 0 && l.used_bytes === (30 + 20 + 5 + 6) * MO, `place abandonnée : plus comptée ; fichiers réels comptés (${l.used_bytes / MO} Mo)`);
  const sB = await start(ADMIN_B, { title: 'Gestes et postures', size: 2 * MO });
  check(!!sB.video_id, 'l’autre compte du bureau n’est plus bloqué');
  await landed(sB.video_path, 2 * MO); await publish(ADMIN_B, sB.video_id);
  const back = await start(ADMIN, { title: 'Rangement', size: 3 * MO });
  check(back.video_id === r2.video_id && await canUpload(ADMIN, r2.video_path), 'le bureau reprend sa place plus tard : URL d’envoi de nouveau accordée');
}

// ═══ Quota : garanti par le serveur ═════════════════════════════════════════
section('Quota de 100 Mo par entreprise : garanti par la base');
{
  // Autre entreprise, pour partir de zéro.
  let l = await limits(ADMIN2);
  check(l.used_bytes === 0 && l.reserved_bytes === 0, 'autre entreprise : sa propre jauge, vide (rien de la première)');
  const a = await start(ADMIN2, { title: 'Vidéo A', size: 45 * MO });
  await landed(a.video_path, 45 * MO); await publish(ADMIN2, a.video_id);
  const b = await start(ADMIN2, { title: 'Vidéo B', size: 45 * MO });
  const e = await startErr(ADMIN2, { title: 'Vidéo C', size: 11 * MO });
  check(e === null, 'la place de B est reprise par C (même compte) : pas de blocage');
  const eBig = await startErr(ADMIN2, { title: 'Vidéo C', size: 56 * MO });
  check(eBig?.code === '22023', 'plus de 50 Mo : refusé avant même le quota');
  await start(ADMIN2, { title: 'Vidéo B', size: 45 * MO });
  await landed(b.video_path, 45 * MO); await publish(ADMIN2, b.video_id);
  l = await limits(ADMIN2);
  check(l.used_bytes === 90 * MO, `90 Mo utilisés (${l.used_bytes / MO})`);
  const full = await startErr(ADMIN2, { title: 'Vidéo C', size: 11 * MO });
  check(full?.code === 'P0001' && /Plus assez de place pour cette vidéo : 90 Mo utilisés sur 100 Mo\./.test(full.msg), `11 Mo de plus : refusé (« ${full?.msg} »)`);
  const fit = await start(ADMIN2, { title: 'Vidéo C', size: 10 * MO });
  check(!!fit.video_id, '10 Mo : accepté (100 Mo pile)');
  // Navigateur trafiqué : annonce 10 Mo, envoie 50 Mo (le bucket n'accepte pas plus).
  await landed(fit.video_path, 50 * MO); await publish(ADMIN2, fit.video_id);
  l = await limits(ADMIN2);
  check(l.used_bytes === 140 * MO, `taille annoncée fausse : la VRAIE taille est comptée (${l.used_bytes / MO} Mo — dépassement d’un seul fichier, 50 Mo au plus)`);
  const after1 = await startErr(ADMIN2, { title: 'Vidéo D', size: 1 });
  check(after1?.code === 'P0001', 'ensuite plus rien ne part, même 1 octet');
  // Deux envois ouverts à la fois sont impossibles : le dépassement ne se cumule pas.
  await root();
  check(await count(`SELECT count(*) n FROM public.training_videos WHERE company_id = $1 AND published_at IS NULL AND archived_at IS NULL`, [CO2]) === 0, 'aucune place ouverte restante dans cette entreprise');
}

// ═══ Lot 6 intact, jamais des heures ════════════════════════════════════════
section('Lot 6 intact ; jamais des heures');
{
  await as(SAM);
  check((await rows('SELECT id, kind FROM public.my_trainings()')).every((x) => x.kind === 'video' || x.kind === 'document') && (await rows('SELECT id FROM public.my_trainings()')).length === 1,
    'my_trainings (lot 6) : inchangée, les vidéos envoyées n’y apparaissent pas');
  await root();
  check(await count('SELECT count(*) n FROM public.time_entries') === 0 && await count('SELECT count(*) n FROM public.active_sessions') === 0, 'aucune heure, aucun chrono écrit');
  check(await count(`SELECT count(*) n FROM public.training_videos`) === 9 && await count(`SELECT count(*) n FROM storage.objects WHERE bucket_id = 'formations'`) === 8,
    'rien n’a été effacé : 9 lignes de vidéos (publiées, retirées, en cours), 8 fichiers');
}

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
{
  const gone = await one(`SELECT (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1))::int AS t,
    (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($2))::int AS f,
    (SELECT count(*) FROM pg_policies WHERE policyname = ANY($3))::int AS p`, [NEW_TABLES, NEW_FNS, NEW_POLICIES]);
  check(gone.t === 0 && gone.f === 0 && gone.p === 0, 'tables, fonctions et policies du lot retirées');
  const back = await prints();
  check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.con === before.con && back.priv === before.priv,
    'après retour arrière : fonctions, policies, triggers, colonnes, contraintes et droits existants identiques à avant');
  check(back.data === before.data, 'données existantes identiques à avant (formations du lot 6, documents, autres buckets)');
  check(await count(`SELECT count(*) n FROM storage.objects WHERE bucket_id = 'formations'`) === 8, 'les fichiers vidéo restent (aucun effacement en SQL ; le bucket se retire au tableau de bord, avec l’accord d’Ergun)');
  check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification après application : de nouveau toute à true');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
