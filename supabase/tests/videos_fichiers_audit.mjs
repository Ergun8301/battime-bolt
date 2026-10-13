// Vidéos de formation : fichiers à vérifier (lot 14, oct. 2026). Rejoué POUR DE VRAI
// sur un Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:videos-audit-db
//
// Même décor que le test du lot 13 (bouchon des lots précédents, schéma `storage`,
// lot 6 puis lot 13 appliqués tels quels, droits PAR DÉFAUT de production), puis
// la migration *_videos_fichiers_a_verifier.sql. La fonction est en LECTURE SEULE :
// on prouve qu'elle ne touche à rien, qu'elle ne voit que l'entreprise de l'appelant
// et qu'aucune suppression n'existe dans le fichier (décision D12).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, '..', 'migrations');
const mig = (f) => fs.readFileSync(path.join(migDir, f), 'utf8');
const MIG_FILE = fs.readdirSync(migDir).find((f) => f.endsWith('_videos_fichiers_a_verifier.sql'));
const LOT13_FILE = fs.readdirSync(migDir).find((f) => f.endsWith('_lot13_videos_envoi_direct.sql'));
const SQL = mig(MIG_FILE);
const LOT13 = mig(LOT13_FILE);
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
const CO3 = 'c0000000-0000-0000-0000-000000000003'; // 150 fichiers sans formation
const ADMIN = 'a0000000-0000-0000-0000-00000000000a';
const ADMIN_B = 'a0000000-0000-0000-0000-00000000000c'; // deuxième compte bureau, MÊME entreprise
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b'; // bureau d'une AUTRE entreprise
const ADMIN3 = 'a0000000-0000-0000-0000-0000000000d3';
const SANS_CO = 'a0000000-0000-0000-0000-0000000000e0'; // compte du bureau sans entreprise
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const ANCIEN = '60000000-0000-0000-0000-000000000006';
const AUTRE = '70000000-0000-0000-0000-000000000007';
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
await db.exec(`INSERT INTO public.companies (id) VALUES ('${CO3}');
  INSERT INTO public.users VALUES ('${ADMIN3}', '${CO3}', 'admin', true, 'Admin', 'Trois');`);
await db.exec(mig('20261010210000_lot6_formations.sql'));
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
await db.exec(LOT13);

const as = async (uid, role = 'authenticated') => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`SET ROLE ${role}`);
};
const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); };
const errOf = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return { code: e.code || '', msg: e.message }; } };
const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];
const count = async (sql, p = []) => Number((await one(sql, p)).n);
const audit = async (uid) => { await as(uid); return rows('SELECT * FROM public.video_files_audit()'); };
const kinds = (r, k) => r.filter((x) => x.kind === k);

/** Une vidéo (ligne) : publiée, retirée, ou place réservée / envoi non terminé. */
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function addVideo(co, n, { published = true, archived = false, size = 4 * MO, file = true, title = `Formation ${n}` } = {}) {
  await root();
  const id = uuid(n), p = `${co}/${id}`;
  await db.query(`INSERT INTO public.training_videos (id, company_id, title, file_path, mime_type, declared_bytes, size_bytes, duration_s, published_at, archived_at)
    VALUES ($1, $2, $3, $4, 'video/webm', $5, $6, 30, $7, $8)`,
    [id, co, title, p, size, published ? size : null, published ? '2026-10-13T08:00:00Z' : null, archived ? '2026-10-13T09:00:00Z' : null]);
  if (file) await addObject(p, size);
  return { id, path: p };
}
async function addObject(name, size, created = '2026-10-13T07:50:00Z') {
  await root();
  await db.query(`INSERT INTO storage.objects (bucket_id, name, owner, created_at, metadata) VALUES ('formations', $1, $2, $3, $4)`,
    [name, ADMIN, created, JSON.stringify({ size, mimetype: 'video/webm', eTag: 'x' })]);
}

/** Les lignes SQL commentées du fichier entre deux repères. */
function commentedBlock(sql, startRe, endRe) {
  const lines = sql.split('\n');
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
const POST_SQL = commentedBlock(SQL, /^-- ── DÉBUT DE LA VÉRIFICATION ──$/, /^-- ── FIN DE LA VÉRIFICATION ──$/);
const ROLLBACK_SQL = commentedBlock(SQL, /^-- ── DÉBUT DU RETOUR ARRIÈRE ──$/, /^-- ── FIN DU RETOUR ARRIÈRE ──$/);
const LOT13_POST = commentedBlock(LOT13, /^-- ── DÉBUT DE LA VÉRIFICATION ──$/, /^-- ── FIN DE LA VÉRIFICATION ──$/);

// ═══ Avant : le lot 13 seul ═════════════════════════════════════════════════
section('Avant la migration : la fonction n’existe pas (l’écran se cache : PGRST202)');
await root();
check((await count(`SELECT count(*) n FROM pg_proc WHERE proname = 'video_files_audit'`)) === 0, 'video_files_audit absente');
const tableCount = () => count(`SELECT count(*) n FROM pg_class WHERE relkind IN ('r', 'p') AND relnamespace IN ('public'::regnamespace, 'storage'::regnamespace)`);
const colPrint = async () => (await one(`SELECT string_agg(table_schema || '.' || table_name || '.' || column_name || ':' || data_type, ',' ORDER BY table_schema, table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema IN ('public', 'storage')`)).s;
const polPrint = async () => (await one(`SELECT string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || cmd, ',' ORDER BY schemaname, tablename, policyname) AS s FROM pg_policies`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname, ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal`)).s;
const fnPrint = async () => (await one(`SELECT string_agg(n.nspname || '.' || p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' ORDER BY n.nspname, p.proname) AS s
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public', 'storage', 'auth') AND p.proname <> 'video_files_audit'`)).s;
const before = { t: await tableCount(), c: await colPrint(), p: await polPrint(), g: await trgPrint(), f: await fnPrint() };
const lot13Rows = await count('SELECT count(*) n FROM public.training_videos');
check(lot13Rows === 0, 'décor : lot 6 puis lot 13 appliqués, aucune vidéo');

// ═══ La migration : une fonction, rien d'autre ══════════════════════════════
section('Migration : une seule fonction, additive, sans suppression, rejouable');
check(MIG_FILE === '20261013143711_videos_fichiers_a_verifier.sql' && MIG_FILE > '20261012100000' && !MIG_FILE.endsWith('_lot13_videos_envoi_direct.sql'),
  `fichier ${MIG_FILE} (horodatage après 20261012100000, n’entre pas en collision avec le suffixe du lot 13)`);
{
  const code = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  check(!/DROP|DELETE|TRUNCATE|CASCADE|ON DELETE/i.test(code), 'sans les lignes « -- » : aucun DROP, DELETE, TRUNCATE, CASCADE ni ON DELETE (corps de fonction compris)');
  check(!code.includes('/*') && !SQL.includes('/*'), 'aucun commentaire /* */');
  check(!/CREATE\s+(TABLE|POLICY|TRIGGER|INDEX)|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+\w|\.remove\(/i.test(code), 'aucune table, colonne, policy, trigger, index, écriture : une fonction et ses droits');
  check(!/training_video/i.test(code.replace(/public\.training_videos\b/g, '')), 'le nom de la fonction ne contient pas « training_video » (le compte v9 = 12 du lot 13 reste vrai)');
  check(/^-- RETOUR ARRIÈRE/m.test(SQL) && /^-- VÉRIFICATION APRÈS APPLICATION.*\n--.*6 × true/m.test(SQL) && /^-- HISTORIQUE/m.test(SQL)
    && SQL.indexOf('RETOUR ARRIÈRE') < SQL.indexOf('VÉRIFICATION APRÈS APPLICATION') && SQL.indexOf('VÉRIFICATION APRÈS APPLICATION') < SQL.indexOf('HISTORIQUE') && SQL.indexOf('HISTORIQUE') < SQL.indexOf('CREATE OR REPLACE FUNCTION'),
    'en-tête : RETOUR ARRIÈRE, VÉRIFICATION (6 × true), HISTORIQUE, avant le code');
  check(/VALUES \('20261013143711', 'videos_fichiers_a_verifier'\) ON CONFLICT DO NOTHING;/.test(SQL), 'HISTORIQUE : version et nom = nom du fichier');
  check(/SECURITY DEFINER SET search_path TO ''/.test(SQL) && /LANGUAGE plpgsql STABLE/.test(SQL), 'SECURITY DEFINER, search_path vide, STABLE (lecture seule)');
}
await root();
check(!!POST_SQL && !!ROLLBACK_SQL && !!LOT13_POST, 'les blocs VÉRIFICATION et RETOUR ARRIÈRE se laissent extraire de l’en-tête');
await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
{
  const after = { t: await tableCount(), c: await colPrint(), p: await polPrint(), g: await trgPrint(), f: await fnPrint() };
  check(after.t === before.t && after.c === before.c, 'aucune table ni colonne ajoutée');
  check(after.p === before.p && after.g === before.g, 'aucune policy ni trigger ajouté');
  check(after.f === before.f, 'fonctions existantes (lot 6, lot 13, get_my_company_id, is_admin…) inchangées');
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 6 && bad.length === 0, `vérification après application : 6 × true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
  const v13 = await one(LOT13_POST);
  check(Object.keys(v13).length === 11 && Object.values(v13).every((x) => x === true), 'la vérification du lot 13 renvoie toujours ses 11 × true (v9 = 12 fonctions)');
  const f = await one(`SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS a, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u, p.provolatile AS v
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'video_files_audit'`);
  check(f.a === false && f.u === true && f.v === 's', 'anon : aucun droit d’exécution (malgré les droits par défaut) ; authenticated : oui ; STABLE');
}

// ═══ Les cas ════════════════════════════════════════════════════════════════
section('Cas : ce qui est signalé, ce qui ne l’est pas');
const OK = await addVideo(CO, 1);                                            // 1. publiée avec fichier
const MANQUE = await addVideo(CO, 2, { file: false, title: 'Gestes et postures' }); // 2. publiée sans fichier
const MANQUE_R = await addVideo(CO, 3, { file: false, archived: true, title: 'Ancienne consigne' }); // 2 bis. retirée sans fichier
const ORPH = `${CO}/${uuid(4)}`; await addObject(ORPH, 5 * MO, '2026-10-12T09:00:00Z');       // 3. fichier sans ligne
const EN_COURS = await addVideo(CO, 5, { published: false, size: 6 * MO });                    // 4. envoi non terminé : ligne non publiée + fichier
const RESERVEE = await addVideo(CO, 6, { published: false, file: false });                     // 5. place réservée, fichier pas arrivé
await addObject(`${CO}/.emptyFolderPlaceholder`, 0);                                           // 6. dossier vide du tableau de bord
const ORPH_B = `${CO2}/${uuid(7)}`; await addObject(ORPH_B, 3 * MO);                           // 7. fichier sans ligne de l’entreprise B
await addVideo(CO2, 8, { file: false, title: 'Formation de B sans fichier' });
await root();
{
  const r = await audit(ADMIN);
  const o = kinds(r, 'fichier_sans_formation'), m = kinds(r, 'formation_sans_fichier');
  check(!r.some((x) => x.file_path === OK.path), '1. vidéo publiée avec son fichier : absente des deux listes');
  const x2 = m.find((x) => x.video_id === MANQUE.id), x3 = m.find((x) => x.video_id === MANQUE_R.id);
  check(!!x2 && x2.archived === false && x2.title === 'Gestes et postures' && x2.file_path === MANQUE.path && x2.occurred_at, '2. publiée sans fichier : « formation_sans_fichier », archived = false');
  check(!!x3 && x3.archived === true, '2 bis. la même, retirée : archived = true (elle peut être remise)');
  check(o.length === 1 && o[0].file_path === ORPH && Number(o[0].real_bytes) === 5 * MO && o[0].video_id === null && o[0].title === null, '3. fichier sans ligne : « fichier_sans_formation » avec sa taille');
  check(!r.some((x) => x.file_path === EN_COURS.path), '4. envoi non terminé (ligne non publiée + fichier) : ABSENT (il reste dans training_video_leftovers)');
  check(!r.some((x) => x.file_path === RESERVEE.path), '5. place réservée sans fichier : absente');
  check(!r.some((x) => x.file_path.includes('.emptyFolderPlaceholder')), '6. « .emptyFolderPlaceholder » ignoré');
  check(m.length === 2 && Number(m[0].total_n) === 2 && o.length === 1 && Number(o[0].total_n) === 1 && Number(o[0].total_bytes) === 5 * MO, 'totaux : 1 fichier (5 Mo), 2 formations');
  await as(ADMIN);
  const lo = await rows('SELECT file_path FROM public.training_video_leftovers()');
  check(lo.some((x) => x.file_path === EN_COURS.path), 'training_video_leftovers (lot 13) montre toujours l’envoi non terminé');
}
{
  const r = await audit(ADMIN);
  check(!r.some((x) => x.file_path === ORPH_B || x.title === 'Formation de B sans fichier'), '7. rien de l’entreprise B pour le bureau de A');
  const rb = await audit(ADMIN2);
  check(kinds(rb, 'fichier_sans_formation').length === 1 && kinds(rb, 'fichier_sans_formation')[0].file_path === ORPH_B
    && kinds(rb, 'formation_sans_fichier').length === 1 && !rb.some((x) => x.file_path.startsWith(`${CO}/`)), '7 bis. le bureau de B voit son fichier et sa formation, rien de A');
  const r2 = await audit(ADMIN_B);
  const key = (x) => x.map((y) => `${y.kind}|${y.file_path}`).sort().join(';');
  check(key(r2) === key(r), '8. un second compte bureau de A voit exactement la même chose');
}

section('Refus : salarié, chef d’équipe, anonyme, compte sans entreprise');
{
  await root();
  const noco = await errExec(`INSERT INTO public.users VALUES ('${SANS_CO}', NULL, 'admin', true, 'Sans', 'Entreprise')`);
  check(!noco, `décor : un compte « bureau » sans entreprise${noco ? ` (${noco})` : ''}`);
  for (const [who, label] of [[SAM, 'salarié'], [CHEF, 'chef d’équipe'], [SANS_CO, 'compte du bureau sans entreprise']]) {
    await as(who);
    const e = await errOf('SELECT * FROM public.video_files_audit()');
    check(e?.code === '42501', `${label} : refusé (42501)`);
  }
  await as(null, 'anon');
  check((await errOf('SELECT * FROM public.video_files_audit()'))?.code === '42501', 'anonyme : refusé (aucun droit d’exécution)');
  await as('a0000000-0000-0000-0000-0000000000ff'); // jeton valide d’un compte inconnu
  check((await errOf('SELECT * FROM public.video_files_audit()'))?.code === '42501', 'compte inconnu (sans fiche) : refusé');
}

section('Volume : 150 fichiers sans formation');
{
  await root();
  let sum = 0;
  for (let i = 0; i < 150; i++) {
    const size = (i % 7 + 1) * 100_000 + i;
    sum += size;
    await db.query(`INSERT INTO storage.objects (bucket_id, name, owner, created_at, metadata) VALUES ('formations', $1, $2, now() - ($3 || ' minutes')::interval, $4)`,
      [`${CO3}/${uuid(1000 + i)}`, ADMIN3, String(i), JSON.stringify({ size, mimetype: 'video/webm' })]);
  }
  const r = await audit(ADMIN3);
  const o = kinds(r, 'fichier_sans_formation');
  check(o.length === 100 && o.every((x) => Number(x.total_n) === 150 && Number(x.total_bytes) === sum), `100 lignes, total_n = 150, total_bytes = ${sum} (somme exacte de TOUS les fichiers)`);
  check(o[0].file_path === `${CO3}/${uuid(1000)}` && new Date(o[0].occurred_at) >= new Date(o[99].occurred_at), 'les plus récents d’abord');
}

section('Lecture seule : rien ne bouge');
{
  await root();
  const snap = async () => JSON.stringify(await rows(`SELECT (SELECT json_agg(v ORDER BY id) FROM public.training_videos v) AS v,
    (SELECT json_agg(o ORDER BY id) FROM storage.objects o) AS o, (SELECT count(*)::int FROM public.training_video_views) AS w`));
  const s0 = await snap();
  for (const who of [ADMIN, ADMIN_B, ADMIN2, ADMIN3]) await audit(who);
  await root();
  check(await snap() === s0, 'lignes de training_videos et objets du stockage identiques avant / après (4 appels)');
  check(await count(`SELECT count(*) n FROM public.training_videos`) === 6 && await count(`SELECT count(*) n FROM storage.objects WHERE bucket_id = 'formations'`) === 155,
    'aucune ligne ni fichier effacé ou ajouté (6 vidéos, 155 fichiers dont le dossier vide)');
  check(await count('SELECT count(*) n FROM public.time_entries') === 0 && await count('SELECT count(*) n FROM public.active_sessions') === 0, 'aucune heure, aucun chrono écrit');
}

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{
  const e = await errExec(ROLLBACK_SQL);
  check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`);
  check(await count(`SELECT count(*) n FROM pg_proc WHERE proname = 'video_files_audit'`) === 0, 'la fonction a disparu');
  const back = { t: await tableCount(), c: await colPrint(), p: await polPrint(), g: await trgPrint(), f: await fnPrint() };
  check(back.t === before.t && back.c === before.c && back.p === before.p && back.g === before.g && back.f === before.f, 'tables, colonnes, policies, triggers et fonctions existants identiques à avant la migration');
  check(await count('SELECT count(*) n FROM public.training_videos') === 6 && await count(`SELECT count(*) n FROM storage.objects WHERE bucket_id = 'formations'`) === 155,
    'les fichiers, lignes et fonctions du lot 13 sont intacts');
  check(await count(`SELECT count(*) n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE '%training_video%'`) === 12, 'les 12 fonctions du lot 13 sont là');
  const e2 = await errExec(SQL);
  check(!e2, 'la migration se recharge après le retour arrière');
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification après application : de nouveau 6 × true');
  check((await audit(ADMIN)).length === 3, 'la fonction répond de nouveau (3 lignes pour A)');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
