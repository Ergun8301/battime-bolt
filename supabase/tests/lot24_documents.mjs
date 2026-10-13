// Documents : factures réservées au bureau, catégorie modifiable (lot 24, oct. 2026).
// Rejoué POUR DE VRAI sur un Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:documents-db
//
// Même bouchon que les lots 6, 11, 12 et 13 (fonctions et policies de PRODUCTION
// recopiées mot pour mot), plus :
//   · la table documents de PRODUCTION : colonnes d'origine, étape 12 et 12 bis
//     (déclencheur guard_document_write, appliqués TELS QUELS depuis leurs
//     fichiers), catégorie du lot 7 (CHECK relu dans son fichier), les QUATRE
//     règles de production (documents_select / _insert / _delete / support_read) ;
//   · le schéma `storage` et les trois règles du bucket chantier-docs, relues
//     dans leur migration d'origine ; un second bucket avec sa propre règle ;
//   · le lot 6 (formations, my_trainings) appliqué tel quel ;
//   · les droits PAR DÉFAUT de production (tout pour anon / authenticated sur les
//     objets neufs et sur documents), pour prouver que la migration les reprend ;
//   · support_company_ids() pilotable (compte support du lot 5).
// Le stockage est simulé comme le fait Supabase : lire / signer / lister un
// fichier = un SELECT sur storage.objects avec les droits de l'utilisateur ;
// effacer = un DELETE avec les droits de l'utilisateur (il doit d'abord LIRE la
// ligne). Les scénarios « abus » rejouent ce qu'un navigateur trafiqué peut
// envoyer. Le déclencheur seul est atteint sous `root` avec un faux auth.uid().
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, '..', 'migrations');
const mig = (f) => fs.readFileSync(path.join(migDir, f), 'utf8');
const MIG_FILE = fs.readdirSync(migDir).find((f) => f.endsWith('_lot24_documents_factures_categorie.sql'));
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
// Le bouchon (STUB) et le schéma storage sont relus dans les tests des lots 11 et 13 : une seule copie.
const slice = (src, start, end) => src.slice(src.indexOf(start) + start.length, src.indexOf(end, src.indexOf(start)));
const lot11 = fs.readFileSync(path.join(here, 'lot11_cloture_salarie.mjs'), 'utf8');
const lot13 = fs.readFileSync(path.join(here, 'lot13_videos_envoi_direct.mjs'), 'utf8');
const STUB = slice(lot11, 'const STUB = `', '`;');
const STORAGE = slice(lot13, 'const STORAGE = `', '`;');

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
const WS = 'e0000000-0000-0000-0000-000000000001', WS_B = 'e0000000-0000-0000-0000-000000000003', WS2 = 'e0000000-0000-0000-0000-000000000002';
const FACT = ['facture', 'facture_payee'];

// Le bucket chantier-docs et ses trois règles, relus dans la migration d'origine.
const CHANTIER = mig('20260625160000_chantier_documents.sql');
const CHANTIER_STORAGE = CHANTIER.slice(CHANTIER.indexOf('INSERT INTO storage.buckets'));
// La colonne « catégorie » du lot 7, avec son CHECK, relue telle quelle.
const LOT7 = mig('20261001100000_lot7_collegues_documents.sql');
const LOT7_CATEGORY = LOT7.slice(LOT7.indexOf('ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS category'), LOT7.indexOf(';', LOT7.indexOf('ADD COLUMN IF NOT EXISTS category')) + 1);

const BASE = `
CREATE OR REPLACE FUNCTION public.support_company_ids() RETURNS uuid[] LANGUAGE sql STABLE
  AS $$ SELECT CASE WHEN nullif(current_setting('test.support_cos', true), '') IS NULL THEN ARRAY[]::uuid[]
                    ELSE string_to_array(current_setting('test.support_cos', true), ',')::uuid[] END $$;
-- documents de PRODUCTION : colonnes d'origine (20260625160000) ; étape 12, 12 bis et lot 7 sont rejoués plus bas.
CREATE TABLE public.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  worksite_id uuid NOT NULL REFERENCES public.worksites(id) ON DELETE CASCADE, uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  label text, file_path text NOT NULL, file_name text, mime_type text, size_bytes bigint, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
`;
const RULES = `
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id() AND uploaded_by = auth.uid());
CREATE POLICY documents_delete ON public.documents FOR DELETE TO authenticated USING (company_id = public.get_my_company_id() AND (public.is_admin() OR uploaded_by = auth.uid()));
CREATE POLICY support_read ON public.documents FOR SELECT TO authenticated USING (company_id = ANY ((SELECT public.support_company_ids())::uuid[]));
-- Droits PAR DÉFAUT de production : tout pour anon et authenticated.
GRANT ALL ON public.documents TO anon, authenticated;
GRANT SELECT ON public.users, public.companies TO authenticated;
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'), ('${ADMIN_B}', '${CO}', 'admin', true, 'Bureau', 'Deux'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'), ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Test'), ('${ANCIEN}', '${CO}', 'worker', false, 'Ancien', 'Test'),
  ('${AUTRE}', '${CO2}', 'worker', true, 'Autre', 'Salarié');
INSERT INTO public.worksites (id, company_id) VALUES ('${WS}', '${CO}'), ('${WS_B}', '${CO}'), ('${WS2}', '${CO2}');
-- Un second bucket avec sa propre règle de lecture : la migration ne doit pas le toucher.
INSERT INTO storage.buckets (id, name, public) VALUES ('worker-photos', 'worker-photos', false);
CREATE POLICY worker_photos_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'worker-photos');
INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('worker-photos', '${SAM}/photo.jpg', '${SAM}');
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);
const db = new PGlite();
await db.exec(STUB);
await db.exec(STORAGE);
await db.exec(CHANTIER_STORAGE);
await db.exec(BASE);
await db.exec(mig('20260920200000_etape12_documents.sql'));
await db.exec(mig('20260920200500_etape12b_nom_photo_serveur.sql'));
await db.exec(LOT7_CATEGORY);
await db.exec(RULES);
await db.exec(mig('20261010210000_lot6_formations.sql'));

const as = async (uid, role = 'authenticated') => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`SET ROLE ${role}`);
};
const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); };
/** Superutilisateur (les règles de lignes et les droits de colonne ne s'appliquent pas) MAIS avec un auth.uid() : atteint le déclencheur seul. */
const rootAs = async (uid) => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid]); };
const support = async (cos) => { await db.query(`SELECT set_config('test.support_cos', $1, false)`, [cos]); };
const errOf = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return { code: e.code || '', msg: e.message }; } };
const err = async (sql, p = []) => (await errOf(sql, p))?.code ?? null;
const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];
const count = async (sql, p = []) => Number((await one(sql, p)).n);
const affected = async (sql, p = []) => (await db.query(sql, p)).affectedRows;

let seq = 0;
/** Pose un document (sous root, avant ou après la migration) et son fichier dans le bucket. */
const addDoc = async (o = {}) => {
  await root();
  const co = o.co ?? CO, ws = o.ws ?? WS;
  const n = ++seq;
  const filePath = o.path ?? `${co}/${ws}/f${n}.pdf`;
  const r = await one(`INSERT INTO public.documents (company_id, worksite_id, uploaded_by, label, file_path, file_name, mime_type, size_bytes, category, time_entry_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 1000, $8, $9) RETURNING id, file_path`,
    [co, ws, o.by === undefined ? ADMIN : o.by, o.label ?? `Doc ${n}`, filePath, `f${n}.pdf`, o.mime ?? 'application/pdf', o.cat ?? null, o.te ?? null]);
  if (o.file !== false && !o.path) await db.query(`INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('chantier-docs', $1, $2, '{"size": 1000}')`, [filePath, o.by ?? ADMIN]);
  return r;
};
const cat = async (id) => { await root(); return (await one('SELECT category FROM public.documents WHERE id = $1', [id]))?.category; };
const logOf = async (id) => { await root(); return rows('SELECT old_category, new_category, actor_id, actor_role FROM public.document_category_log WHERE document_id = $1 ORDER BY id', [id]); };
const upd = (id, set, val) => [`UPDATE public.documents SET ${set} = $2 WHERE id = $1`, [id, val]];
/** Un utilisateur change une catégorie : { n: lignes touchées, e: erreur } */
const setCatN = async (uid, id, value) => {
  await as(uid);
  try { const r = await db.query(`UPDATE public.documents SET category = $2 WHERE id = $1`, [id, value]); return { n: r.affectedRows, e: null }; }
  catch (e) { return { n: 0, e: { code: e.code || '', msg: e.message } }; }
};
const canReadFile = async (uid, name, bucket = 'chantier-docs') => { await as(uid); return (await rows(`SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2`, [bucket, name])).length === 1; };
const seesRow = async (uid, id) => { await as(uid); return (await rows('SELECT 1 FROM public.documents WHERE id = $1', [id])).length === 1; };
const nDocs = async (uid, where = 'true') => { await as(uid); return count(`SELECT count(*) n FROM public.documents WHERE ${where}`); };
const INV = `category IN ('facture', 'facture_payee')`;

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
const NEW_TABLES = ['document_category_log'];
const NEW_FNS = ['document_category_ready', 'guard_document_category', 'log_document_category', 'chantier_doc_readable'];
const NEW_POLICIES = ['document_category_log_select_office', 'documents_factures_bureau', 'documents_update_categorie', 'chantier_docs_factures_bureau'];
const NEW_TRIGGERS = ['documents_a_category_guard', 'documents_z_category_log'];
const NEW_INDEXES = ['documents_facture_path_idx', 'document_category_log_doc_idx', 'document_category_log_company_idx', 'document_category_log_pkey'];

// ═══ Avant : l'application d'aujourd'hui ════════════════════════════════════
section('Avant la migration : rien du lot n’existe (l’application se cache), les salariés voient les factures');
let D = {}; // documents de référence
{
  const r = await one(`SELECT to_regclass('public.document_category_log') IS NULL AS t, (SELECT count(*) FROM pg_proc WHERE proname = ANY($1))::int AS f,
    (SELECT count(*) FROM pg_policies WHERE policyname = ANY($2))::int AS p FROM (SELECT 1) x`, [NEW_FNS, NEW_POLICIES]);
  check(r.t && r.f === 0 && r.p === 0, 'ni trace, ni fonction, ni règle du lot (PGRST202 côté appli : le bouton reste caché)');
  check(await count(`SELECT count(*) n FROM pg_policies WHERE tablename = 'documents'`) === 4, 'documents : QUATRE règles d’origine, aucune règle de mise à jour');
  D.devis = await addDoc({ cat: 'devis' });
  D.plan = await addDoc({ cat: 'plan' });
  D.photo = await addDoc({ cat: 'photo', by: SAM, mime: 'image/jpeg' });
  D.nul = await addDoc({});
  D.fact = await addDoc({ cat: 'facture' });
  D.factp = await addDoc({ cat: 'facture_payee' });
  D.factSam = await addDoc({ cat: 'facture', by: SAM });
  D.resSam = await addDoc({ cat: 'reserve', by: SAM });
  D.alex = await addDoc({ cat: 'autre', by: ALEX });
  D.fact2 = await addDoc({ cat: 'facture', co: CO2, ws: WS2, by: ADMIN2 });
  D.devis2 = await addDoc({ cat: 'devis', co: CO2, ws: WS2, by: ADMIN2 });
  await root();
  D.orphan = `${CO}/${WS}/orphelin.pdf`;
  await db.query(`INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('chantier-docs', $1, $2, '{"size": 1000}')`, [D.orphan, ADMIN]);
  const invPaths = [D.fact, D.factp, D.factSam].map((d) => d.file_path);
  await as(SAM);
  const sees = await count(`SELECT count(*) n FROM public.documents WHERE ${INV}`);
  const files = (await rows(`SELECT name FROM storage.objects WHERE bucket_id = 'chantier-docs' AND name = ANY($1)`, [invPaths])).length;
  check(sees === 3 && files === 3, `AVANT : Sam lit les 3 factures de son entreprise (${sees}) et leurs 3 fichiers (${files})`);
  check(await count(`SELECT count(*) n FROM public.documents`) === 9, 'AVANT : Sam voit les 9 documents de son entreprise');
}
await root();
// Formations de référence (lot 6) : une « document » sur un devis, une vidéo.
let T = {};
{
  await as(ADMIN);
  T.doc = (await one(`INSERT INTO public.trainings (company_id, title, kind, video_url, document_id, all_team, assignee_ids) VALUES ($1, 'Livret devis', 'document', null, $2, true, '{}') RETURNING id`, [CO, D.devis.id])).id;
  T.video = (await one(`INSERT INTO public.trainings (company_id, title, kind, video_url, document_id, all_team, assignee_ids) VALUES ($1, 'Port du harnais', 'video', 'https://youtu.be/abc', null, true, '{}') RETURNING id`, [CO])).id;
  await as(SAM);
  const mine = await rows('SELECT id, document_name FROM public.my_trainings()');
  check(mine.length === 2 && mine.some((x) => x.id === T.doc && x.document_name), 'AVANT : Sam reçoit la formation « document » (devis) et la vidéo (lot 6)');
}

// ═══ La migration : additive, sans DROP ni DELETE, rejouable ════════════════
section('Migration : additive, aucun DROP ni DELETE exécuté, aucune règle existante modifiée, rejouable, droits repris');
const fnPrint = async () => (await one(`SELECT string_agg(n.nspname || '.' || p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' ORDER BY n.nspname, p.proname) AS s
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public', 'storage', 'auth') AND NOT (p.proname = ANY($1)) AND p.proname <> 'my_trainings'`, [NEW_FNS])).s;
const polPrint = async () => (await one(`SELECT string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || permissive || ':' || cmd || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY schemaname, tablename, policyname) AS s
  FROM pg_policies WHERE NOT (policyname = ANY($1))`, [NEW_POLICIES])).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal AND NOT (tgname = ANY($1))`, [NEW_TRIGGERS])).s;
const colPrint = async () => (await one(`SELECT string_agg(table_schema || '.' || table_name || '.' || column_name || ':' || data_type || ':' || coalesce(column_default, '') || ':' || is_nullable, ',' ORDER BY table_schema, table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema IN ('public', 'storage') AND NOT (table_name = ANY($1))`, [NEW_TABLES])).s;
const conPrint = async () => (await one(`SELECT string_agg(conrelid::regclass::text || '.' || conname || ':' || md5(pg_get_constraintdef(oid)), ',' ORDER BY 1) AS s
  FROM pg_constraint WHERE connamespace IN ('public'::regnamespace, 'storage'::regnamespace) AND NOT (conrelid::regclass::text = ANY($1))`, [NEW_TABLES])).s;
const idxPrint = async () => (await one(`SELECT string_agg(schemaname || '.' || indexname || ':' || indexdef, ',' ORDER BY schemaname, indexname) AS s FROM pg_indexes
  WHERE schemaname IN ('public', 'storage') AND NOT (indexname = ANY($1))`, [NEW_INDEXES])).s;
// Les droits de TOUTES les tables existantes sauf documents (dont la mise à jour change exprès).
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relnamespace::regnamespace::text AS s, c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE c.relnamespace IN ('public'::regnamespace, 'storage'::regnamespace) AND c.relkind = 'r' AND NOT (c.relname = ANY($1)) AND c.relname <> 'documents' ORDER BY 1, 2, 3`, [NEW_TABLES]));
const dataPrint = async () => JSON.stringify(await rows(`SELECT (SELECT json_agg(b ORDER BY id) FROM (SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets) b) AS b,
  (SELECT json_agg(o ORDER BY bucket_id, name) FROM (SELECT bucket_id, name, metadata FROM storage.objects) o) AS o,
  (SELECT json_agg(t ORDER BY id) FROM public.trainings t) AS t, (SELECT json_agg(d ORDER BY id) FROM public.documents d) AS d, (SELECT json_agg(u ORDER BY id) FROM public.users u) AS u`));
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), con: await conPrint(), idx: await idxPrint(), priv: await privPrint(), data: await dataPrint() });
const myTrainingsDef = async () => one(`SELECT md5(pg_get_functiondef(p.oid)) AS def, pg_get_function_result(p.oid) AS res, p.prosecdef, array_to_string(p.proconfig, ',') AS cfg, p.proacl::text AS acl, p.provolatile
  FROM pg_proc p WHERE p.oid = 'public.my_trainings()'::regprocedure`);
await root();
const before = await prints();
const docsPrivBefore = await one(`SELECT has_table_privilege('authenticated', 'public.documents', 'SELECT') AS s, has_table_privilege('authenticated', 'public.documents', 'INSERT') AS i,
  has_table_privilege('authenticated', 'public.documents', 'DELETE') AS d, has_table_privilege('authenticated', 'public.documents', 'UPDATE') AS u, has_table_privilege('anon', 'public.documents', 'UPDATE') AS ua`);
const trBefore = await myTrainingsDef();
const polsBefore = await rows(`SELECT policyname FROM pg_policies WHERE tablename = 'documents' ORDER BY 1`);
check(docsPrivBefore.u && docsPrivBefore.ua, 'AVANT : documents a le droit UPDATE pour anon et authenticated (droits par défaut de production), mais aucune règle');
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
check(/^20261013120000_lot24_documents_factures_categorie\.sql$/.test(MIG_FILE) && MIG_FILE > '20261012100000_lot8_versions_planning.sql', `fichier ${MIG_FILE} (postérieur à 20261012100000)`);
{
  // Contrôle automatique : le code (lignes hors commentaires, corps de fonctions et blocs DO compris).
  const code = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const found = (re) => (code.match(re) || []).length;
  check(found(/DROP|DELETE|TRUNCATE|CASCADE|ON DELETE/gi) === 0, 'grep DROP / DELETE / TRUNCATE / CASCADE / ON DELETE sur le fichier sans commentaires : 0 résultat');
  check(found(/\bALTER\s+POLICY\b/gi) === 0 && found(/\bDROP\s+POLICY\b/gi) === 0 && found(/\bFOR\s+(DELETE|ALL)\b/gi) === 0, 'aucun ALTER POLICY, aucun DROP POLICY, aucune règle FOR DELETE / FOR ALL (lot 29 : documents_insert et documents_delete intacts)');
  const alters = code.match(/\bALTER\s+\w+[^;]*/gi) || [];
  check(alters.length === 1 && /^ALTER TABLE public\.document_category_log ENABLE ROW LEVEL SECURITY$/.test(alters[0].trim()), `ALTER : seulement « ENABLE ROW LEVEL SECURITY » sur la trace neuve (${alters.map((a) => a.trim()).join(' ; ')})`);
  check(!/\bRENAME\b/i.test(code) && !/\bUPDATE\s+(storage|public)\./i.test(code) && !/\bINSERT\s+INTO\s+(?!public\.document_category_log)/i.test(code), 'aucun RENAME ; aucune mise à jour ni insertion hors de la trace (le seul INSERT est celui du déclencheur de trace)');
  const pols = [...code.matchAll(/CREATE POLICY (\w+)/g)].map((m) => m[1]);
  check(pols.length === 4 && pols.every((p) => new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_policies WHERE[^)]*policyname = '${p}'\\) THEN\\s+CREATE POLICY ${p}`).test(code)),
    'les 4 règles sont créées seulement si elles manquent (bloc DO + pg_policies)');
  const trgs = [...code.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]);
  check(trgs.length === 2 && trgs.every((t) => new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_trigger WHERE tgname = '${t}'`).test(code)), 'les 2 déclencheurs sont créés seulement s’ils manquent');
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]).sort();
  check(JSON.stringify(fns) === JSON.stringify([...NEW_FNS, 'my_trainings'].sort()), `fonctions créées ou remplacées : les 4 neuves + my_trainings (${fns.join(', ')})`);
  check(SQL.includes(`position`) && /^-- RETOUR ARRIÈRE/m.test(SQL.slice(0, 1200)) && SQL.indexOf('-- VÉRIFICATION APRÈS APPLICATION') < SQL.indexOf('-- HISTORIQUE') && SQL.indexOf('-- HISTORIQUE') < SQL.indexOf('\nCREATE OR REPLACE FUNCTION'),
    'en-tête : RETOUR ARRIÈRE, VÉRIFICATION APRÈS APPLICATION, HISTORIQUE, avant le code');
  check(/CHANGEMENT NON ADDITIF DANS SES EFFETS/.test(SQL.slice(0, 600)) && /0 document en production/.test(SQL.slice(0, 900)), 'en-tête : « changement non additif dans ses effets » et « 0 document en production » écrits en toutes lettres');
  check(/INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\n--\s+VALUES \('20261013120000', 'lot24_documents_factures_categorie'\) ON CONFLICT DO NOTHING;/.test(SQL), 'HISTORIQUE : version et nom du fichier, ON CONFLICT DO NOTHING');
  check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
}
await db.exec(SQL);
const afterOnce = await one(`SELECT (SELECT count(*) FROM pg_policies)::int AS p, (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)::int AS t, (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace)::int AS f,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public')::int AS i`);
check(!(await errExec(SQL)), 'migration chargée une seconde fois sans erreur (rejouable)');
{
  const again = await one(`SELECT (SELECT count(*) FROM pg_policies)::int AS p, (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)::int AS t, (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace)::int AS f,
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public')::int AS i`);
  check(JSON.stringify(afterOnce) === JSON.stringify(again), `rejouée : mêmes décomptes (règles ${again.p}, déclencheurs ${again.t}, fonctions ${again.f}, index ${again.i})`);
}
await root();
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (get_my_company_id, is_admin, guard_document_write, lot 6 hors my_trainings…)');
check(before.pol === after.pol, 'règles existantes inchangées, texte pour texte (documents_select / _insert / _delete / support_read, chantier_docs_*, formations…)');
check(before.trg === after.trg, 'déclencheurs existants inchangés (documents_guard_write…)');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée sur les tables existantes');
check(before.con === after.con, 'contraintes existantes inchangées (CHECK de catégorie du lot 7…)');
check(before.idx === after.idx, 'index existants inchangés');
check(before.priv === after.priv, 'droits des autres tables inchangés');
check(before.data === after.data, 'données existantes inchangées (documents, fichiers, buckets, formations, utilisateurs)');
{
  const pols = await rows(`SELECT policyname FROM pg_policies WHERE tablename = 'documents' ORDER BY 1`);
  check(JSON.stringify(pols.map((p) => p.policyname)) === JSON.stringify([...polsBefore.map((p) => p.policyname), 'documents_factures_bureau', 'documents_update_categorie'].sort()),
    `documents : les 4 règles d’origine + 2 neuves (${pols.map((p) => p.policyname).join(', ')})`);
  const sp = await rows(`SELECT policyname, permissive, cmd FROM pg_policies WHERE policyname = ANY($1) ORDER BY 1`, [NEW_POLICIES]);
  check(JSON.stringify(sp.map((x) => `${x.policyname}:${x.permissive}:${x.cmd}`)) === JSON.stringify([
    'chantier_docs_factures_bureau:RESTRICTIVE:SELECT', 'document_category_log_select_office:PERMISSIVE:SELECT', 'documents_factures_bureau:RESTRICTIVE:SELECT', 'documents_update_categorie:PERMISSIVE:UPDATE']),
    'les 4 règles neuves : 2 RESTRICTIVES de lecture, 1 lecture de la trace, 1 mise à jour — rien d’autre');
  const tr = await myTrainingsDef();
  check(tr.res === trBefore.res && tr.prosecdef === trBefore.prosecdef && tr.cfg === trBefore.cfg && tr.acl === trBefore.acl && tr.provolatile === trBefore.provolatile && tr.def !== trBefore.def,
    'my_trainings() : même signature, mêmes colonnes, SECURITY DEFINER, search_path vide, mêmes droits, STABLE ; seul le corps change');
  const d = await one(`SELECT has_table_privilege('authenticated', 'public.documents', 'SELECT') AS s, has_table_privilege('authenticated', 'public.documents', 'INSERT') AS i,
    has_table_privilege('authenticated', 'public.documents', 'DELETE') AS d, has_table_privilege('authenticated', 'public.documents', 'UPDATE') AS u, has_table_privilege('anon', 'public.documents', 'UPDATE') AS ua,
    has_column_privilege('authenticated', 'public.documents', 'category', 'UPDATE') AS c, has_column_privilege('authenticated', 'public.documents', 'label', 'UPDATE') AS l,
    NOT has_any_column_privilege('anon', 'public.documents', 'UPDATE') AS anon_none`);
  check(d.s && d.i && d.d && !d.u && !d.ua && d.anon_none && d.c && d.l, 'droits de documents : lecture / ajout / suppression comme avant ; UPDATE retiré de la table (authenticated ET anon), rendu sur category et label seulement');
  const ac = await one(`SELECT (SELECT count(*) FROM information_schema.column_privileges WHERE table_name = 'documents' AND grantee = 'authenticated' AND privilege_type = 'UPDATE')::int AS n`);
  check(ac.n === 2, 'exactement 2 colonnes modifiables par authenticated');
}
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 13 && bad.length === 0, `vérification après application : 13 × true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
  const fns = await one(`SELECT count(*)::int AS n, bool_and(prosecdef) AS d, bool_and(array_to_string(proconfig, ',') = 'search_path=""') AS s,
    bool_or(has_function_privilege('anon', oid, 'EXECUTE')) AS a FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [NEW_FNS.filter((f) => f !== 'document_category_ready')]);
  check(fns.n === 3 && fns.d && fns.s && !fns.a, '3 fonctions SECURITY DEFINER à search_path vide, anon exclu (malgré les droits par défaut)');
  const inv = await rows(`SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('guard_document_category', 'log_document_category') AND has_function_privilege('authenticated', oid, 'EXECUTE')`);
  check(inv.length === 0, 'les deux fonctions de déclencheur sont fermées au navigateur (authenticated sans EXECUTE)');
  check(await count(`SELECT count(*) n FROM pg_trigger WHERE tgrelid = 'public.documents'::regclass AND NOT tgisinternal`) === 3, 'documents : 3 déclencheurs (garde du lot 24, recalage de l’étape 12, trace)');
  const order = await rows(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.documents'::regclass AND NOT tgisinternal AND (tgtype & 2) = 2 ORDER BY tgname COLLATE "C"`);
  check(order[0].tgname === 'documents_a_category_guard' && order[1].tgname === 'documents_guard_write', `ordre des déclencheurs AVANT : ${order.map((o) => o.tgname).join(' → ')}`);
}

// ═══ Anonyme ════════════════════════════════════════════════════════════════
section('Anonyme : rien');
{
  await as(null, 'anon');
  check(await err('SELECT * FROM public.document_category_log') === '42501', 'anon : lecture de la trace refusée');
  check(await err(`UPDATE public.documents SET category = 'autre' WHERE id = $1`, [D.devis.id]) === '42501', 'anon : modifier la catégorie d’un document refusé (droit retiré)');
  check(await err('SELECT public.document_category_ready()') === '42501', 'anon : « suis-je prête ? » refusée');
  check(await err(`SELECT public.chantier_doc_readable('x')`) === '42501', 'anon : chantier_doc_readable refusée');
  check(await count('SELECT count(*) n FROM public.documents') === 0, 'anon : aucun document lisible (aucune règle)');
}

// ═══ B. Lecture des lignes ══════════════════════════════════════════════════
section('B — Lecture des lignes : les factures sont réservées au bureau de leur entreprise');
{
  for (const [nom, uid] of [['Sam (salarié)', SAM], ['Alex (salarié)', ALEX], ['chef d’équipe', CHEF]]) {
    const f = await nDocs(uid, INV), tot = await nDocs(uid);
    check(f === 0 && tot === 6, `APRÈS : ${nom} : 0 facture, 6 documents visibles sur 9 (${f} / ${tot})`);
  }
  await as(SAM);
  const lus = (await rows('SELECT category FROM public.documents ORDER BY category NULLS FIRST')).map((r) => r.category);
  check(JSON.stringify(lus) === JSON.stringify([null, 'autre', 'devis', 'photo', 'plan', 'reserve']), `Sam voit exactement : sans catégorie, autre, devis, photo, plan, reserve (${lus.join(', ')})`);
  for (const [nom, uid] of [['bureau', ADMIN], ['second compte du bureau', ADMIN_B]]) {
    check(await nDocs(uid) === 9 && await nDocs(uid, INV) === 3, `APRÈS : ${nom} : les 9 documents dont les 3 factures`);
  }
  check(await nDocs(ADMIN2) === 2 && await nDocs(ADMIN2, `company_id = '${CO}'`) === 0 && await nDocs(ADMIN2, INV) === 1, 'bureau d’une autre entreprise : ses 2 documents (dont sa facture), aucun de CO');
  check(await nDocs(AUTRE) === 1 && await nDocs(AUTRE, INV) === 0, 'salarié de l’autre entreprise : 1 document, pas la facture de SON entreprise non plus');
  check(await nDocs(ANCIEN) === 0, 'salarié archivé : 0 document');
  // Sam et SA propre facture, posée avant la migration.
  check(!(await seesRow(SAM, D.factSam.id)), 'la facture que Sam avait déposée AVANT la migration lui est invisible');
  await as(SAM);
  check((await affected(`UPDATE public.documents SET category = 'autre' WHERE id = $1`, [D.factSam.id])) === 0 && await cat(D.factSam.id) === 'facture', 'son UPDATE sur cette facture : 0 ligne, la catégorie n’a pas bougé');
  await as(SAM);
  const delSam = await affected(`DELETE FROM public.documents WHERE id = $1`, [D.factSam.id]);
  await root();
  check(delSam === 0 && await count(`SELECT count(*) n FROM public.documents WHERE id = '${D.factSam.id}'`) === 1, 'son DELETE (avec filtre) sur cette facture : 0 ligne, la ligne existe toujours (vérifié en root)');
  await as(SAM);
  check((await affected(`DELETE FROM public.documents WHERE id = ANY($1)`, [[D.fact.id, D.factp.id]])) === 0, 'son DELETE sur les factures du bureau : 0 ligne');
  await root();
  check(await count(`SELECT count(*) n FROM public.documents WHERE ${INV} AND company_id = '${CO}'`) === 3, 'vérifié en root : les 3 factures de CO existent toujours');
  // Limite connue : un DELETE SANS AUCUN FILTRE ne lit pas la ligne (pas de WHERE ni de RETURNING) ; il agit donc comme avant, sur
  // ce que documents_delete d'origine lui permet (SES propres dépôts). Il n'efface jamais le fichier (bloqué plus bas) ni un document d'autrui.
  await db.exec('BEGIN');
  await as(SAM);
  const bare = await affected('DELETE FROM public.documents');
  await root();
  const left = await rows(`SELECT id FROM public.documents WHERE id = ANY($1)`, [[D.fact.id, D.factp.id, D.devis.id, D.alex.id]]);
  const sams = await count(`SELECT count(*) n FROM public.documents WHERE uploaded_by = '${SAM}'`);
  await db.exec('ROLLBACK');
  check(bare >= 1 && left.length === 4 && sams === 0, `limite connue (documentée) : un DELETE sans aucun filtre n’atteint que les dépôts de Sam lui-même (${bare} lignes dont sa facture d’avant) — jamais les factures du bureau ni les documents d’un collègue ; essai annulé`);
  // Compte support (lot 5) : lecture seule d'une entreprise visitée ; support_company_ids() = [CO].
  const NOINV = `(category IS NULL OR category NOT IN ('facture', 'facture_payee'))`;
  await support(CO);
  for (const [nom, uid] of [['bureau de CO2', ADMIN2], ['salarié de CO2', AUTRE]]) {
    const non = await nDocs(uid, `company_id = '${CO}' AND ${NOINV}`);
    const inv = await nDocs(uid, `company_id = '${CO}' AND ${INV}`);
    check(non === 6 && inv === 0, `compte support (${nom}) qui visite CO : lit les 6 non-factures (lot 5), AUCUNE des 3 factures — même s’il est bureau de sa propre entreprise (${non} / ${inv})`);
  }
  check(await nDocs(ADMIN2, INV) === 1, 'ce compte bureau de CO2 continue de lire la facture de SON entreprise');
  await as(SAM);
  await support('');
  check(await nDocs(SAM, INV) === 0, 'sans visite de support : retour à la normale');
}

// ═══ C. Fichiers ════════════════════════════════════════════════════════════
section('C — Fichiers du bucket chantier-docs : le salarié ne peut pas télécharger le fichier d’une facture, même en connaissant son chemin');
{
  const P = (d) => d.file_path;
  check(!(await canReadFile(SAM, P(D.fact))) && !(await canReadFile(SAM, P(D.factp))) && !(await canReadFile(SAM, P(D.factSam))), 'Sam, Alex, chef : AUCUN des 3 fichiers de facture (chemin connu)');
  check(!(await canReadFile(ALEX, P(D.fact))) && !(await canReadFile(CHEF, P(D.factp))), 'Alex et le chef d’équipe : idem');
  check(await canReadFile(SAM, P(D.devis)) && await canReadFile(SAM, P(D.plan)) && await canReadFile(SAM, P(D.nul)), 'Sam lit toujours devis, plan, sans catégorie');
  check(await canReadFile(SAM, D.orphan), 'Sam lit le fichier orphelin (aucune ligne) : comme avant (D12)');
  check(await canReadFile(ADMIN, P(D.fact)) && await canReadFile(ADMIN, P(D.factp)) && await canReadFile(ADMIN_B, P(D.factSam)), 'le bureau lit les 3 fichiers de facture');
  check(!(await canReadFile(ADMIN2, P(D.fact))) && !(await canReadFile(ADMIN2, P(D.devis))), 'le bureau d’une autre entreprise : ni la facture ni le devis de CO (règle de dossier d’origine)');
  check(!(await canReadFile(AUTRE, P(D.fact))) && !(await canReadFile(ANCIEN, P(D.devis))), 'salarié d’une autre entreprise et salarié archivé : rien');
  await as(SAM);
  const list = (await rows(`SELECT name FROM storage.objects WHERE bucket_id = 'chantier-docs' ORDER BY name`)).map((r) => r.name);
  const invPaths = [D.fact, D.factp, D.factSam].map(P);
  check(!list.some((n) => invPaths.includes(n)) && list.includes(P(D.devis)) && list.includes(D.orphan) && list.length === 7, `« liste » du bucket par Sam : 7 fichiers (6 documents + l’orphelin), aucune facture (${list.length})`);
  await as(ADMIN);
  check((await rows(`SELECT name FROM storage.objects WHERE bucket_id = 'chantier-docs' AND name = ANY($1)`, [invPaths])).length === 3, '« liste » par le bureau : les 3 factures y sont');
  // Effacer un fichier de facture.
  const tmp = await addDoc({ cat: 'facture', by: SAM });
  await as(SAM);
  check((await affected(`DELETE FROM storage.objects WHERE bucket_id = 'chantier-docs' AND name = $1`, [P(tmp)])) === 0, 'Sam ne peut pas effacer le fichier d’une facture (le DELETE doit d’abord le lire) : 0 ligne');
  await root();
  check(await count(`SELECT count(*) n FROM storage.objects WHERE name = '${P(tmp)}'`) === 1, '… le fichier est toujours là (vérifié en root)');
  await as(ADMIN);
  check((await affected(`DELETE FROM storage.objects WHERE bucket_id = 'chantier-docs' AND name = $1`, [P(tmp)])) === 1, 'le bureau peut effacer ce fichier, comme avant (règle d’origine chantier_docs_delete)');
  // Le fichier suit la catégorie de la ligne.
  const mv = await addDoc({ cat: 'facture' });
  check(!(await canReadFile(SAM, P(mv))), 'facture : illisible pour Sam');
  check((await setCatN(ADMIN, mv.id, 'autre')).n === 1 && await canReadFile(SAM, P(mv)), 'le bureau passe la facture en « autre » : Sam lit maintenant le fichier');
  check((await setCatN(ADMIN, mv.id, 'facture_payee')).n === 1 && !(await canReadFile(SAM, P(mv))), 'repassée en facture payée : Sam ne le lit plus');
  // Une ligne NULL ajoutée par un salarié sur le chemin d'une facture ne débloque rien.
  await as(SAM);
  const sneaky = await errOf(`INSERT INTO public.documents (company_id, worksite_id, uploaded_by, label, file_path, file_name, mime_type, category) VALUES ($1, $2, $3, 'Copie', $4, 'x.pdf', 'application/pdf', NULL)`, [CO, WS, SAM, P(D.fact)]);
  check(sneaky === null, 'Sam peut ajouter une ligne sans catégorie portant le chemin de la facture (la règle d’insertion d’origine ne regarde pas le chemin)');
  check(!(await canReadFile(SAM, P(D.fact))), '… mais le fichier de la facture reste illisible : la fonction teste TOUTES les lignes portant ce chemin (facture ET sans catégorie)');
  await root();
  check(await count(`SELECT count(*) n FROM public.documents WHERE file_path = '${P(D.fact)}'`) === 2, 'vérifié : deux lignes, même chemin (le cas « Annuler » d’une suppression)');
  // Un autre bucket n'est pas touché.
  check(await canReadFile(SAM, `${SAM}/photo.jpg`, 'worker-photos'), 'un objet d’un AUTRE bucket reste lisible (bucket_id <> chantier-docs)');
  // La fonction appelée directement.
  await as(SAM);
  const f = async (n) => (await one('SELECT public.chantier_doc_readable($1) AS r', [n])).r;
  check(await f(P(D.fact)) === false && await f(P(D.devis)) === true && await f(D.orphan) === true && await f('nimporte/quoi') === true, 'chantier_doc_readable par Sam : faux sur une facture, vrai sinon (ne dévoile aucune autre information)');
  await as(ADMIN);
  check(await f(P(D.fact)) === true, 'chantier_doc_readable par le bureau : vrai sur la facture de son dossier');
  await as(ADMIN2);
  check(await f(P(D.fact)) === false, 'chantier_doc_readable par le bureau d’une autre entreprise : faux sur la facture de CO');
  await as(ADMIN2);
  check(await f(P(D.fact2)) === true, '… et vrai sur la facture de SON entreprise');
  // Les trois règles d'origine du bucket.
  await root();
  const orig = await rows(`SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'chantier_docs%' ORDER BY 1`);
  check(JSON.stringify(orig.map((p) => `${p.policyname}:${p.cmd}`)) === JSON.stringify(['chantier_docs_delete:DELETE', 'chantier_docs_factures_bureau:SELECT', 'chantier_docs_insert:INSERT', 'chantier_docs_read:SELECT']),
    'storage : les 3 règles d’origine + 1 neuve (lecture) ; aucune règle d’effacement ajoutée');
  // Envoi d'un fichier (INSERT) inchangé : fichier d'abord, ligne ensuite.
  await as(SAM);
  check(await err(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('chantier-docs', $1, $2)`, [`${CO}/${WS}/nouveau.pdf`, SAM]) === null, 'l’envoi d’un fichier (sans ligne encore) par un salarié fonctionne toujours');
  await as(ADMIN);
  check(await err(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('chantier-docs', $1, $2) RETURNING id`, [`${CO}/${WS}/facture-neuve.pdf`, ADMIN]) === null, 'l’envoi d’un fichier par le bureau fonctionne toujours (INSERT … RETURNING)');
}

// ═══ D. Dépôt ═══════════════════════════════════════════════════════════════
section('D — Dépôt : un non-bureau ne peut pas déposer de facture (avec ou sans RETURNING)');
const INS = `INSERT INTO public.documents (company_id, worksite_id, uploaded_by, label, file_path, file_name, mime_type, category) VALUES ($1, $2, $3, $4, $5, 'x.pdf', 'application/pdf', $6)`;
const insDoc = async (uid, c, ret) => {
  await as(uid);
  const n = ++seq;
  return errOf(`${INS}${ret ? ' RETURNING id, category' : ''}`, [CO, WS, uid, `Dépôt ${n}`, `${CO}/${WS}/depot${n}.pdf`, c]);
};
const nbDocs = async () => { await root(); return count(`SELECT count(*) n FROM public.documents`); };
const dFacturesAbuse = async (tag) => {
  const avant = await nbDocs();
  let bons = 0;
  for (const [nom, uid] of [['Sam', SAM], ['Alex', ALEX], ['chef', CHEF]]) {
    for (const c of FACT) {
      for (const ret of [true, false]) {
        const e = await insDoc(uid, c, ret);
        if (e?.code === '42501' && /réservées au bureau/.test(e.msg)) bons++;
        else console.log(`  (inattendu ${tag} ${nom} ${c} ret=${ret} : ${JSON.stringify(e)})`);
      }
    }
  }
  check(bons === 12 && await nbDocs() === avant, `${tag}dépôt d’une facture / facture payée, avec et sans RETURNING, par Sam, Alex et le chef : 12 / 12 refusés (42501, « réservées au bureau »), aucune ligne créée`);
};
{
  await dFacturesAbuse('');
  const e = await insDoc(SAM, 'facture', false);
  check(e.msg === 'Les factures sont réservées au bureau.', `message affichable tel quel : « ${e.msg} »`);
  for (const [nom, uid] of [['Sam', SAM], ['Alex', ALEX], ['chef', CHEF]]) {
    const res = [];
    for (const c of ['reserve', 'devis', 'photo', null, 'plan', 'pv_reception', 'autre']) res.push((await insDoc(uid, c, true)) === null);
    check(res.every(Boolean), `${nom} : reserve, devis, photo, sans catégorie, plan, pv_reception, autre se déposent comme avant (7 / 7)`);
  }
  // Une photo sans libellé reçoit son nom de la base (guard_document_write, étape 12 bis).
  await as(SAM);
  const ph = await one(`INSERT INTO public.documents (company_id, worksite_id, uploaded_by, label, file_path, file_name, mime_type, category, work_date) VALUES ($1, $2, $3, '', $4, 'p.jpg', 'image/jpeg', 'photo', '2026-10-01') RETURNING label, photo_no`, [CO, WS, SAM, `${CO}/${WS}/photo-auto.jpg`]);
  check(/^Photo \d+ — 01\/10\/2026$/.test(ph.label) && ph.photo_no >= 1, `une photo déposée par un salarié reçoit toujours son nom automatique (« ${ph.label} »)`);
  await as(ADMIN);
  const a = await errOf(`${INS} RETURNING id, category`, [CO, WS, ADMIN, 'Facture bureau', `${CO}/${WS}/facture-b.pdf`, 'facture']);
  check(a === null, 'le bureau dépose une facture avec RETURNING : accepté');
  await as(ADMIN_B);
  check((await errOf(`${INS} RETURNING id`, [CO, WS, ADMIN_B, 'Facture bureau 2', `${CO}/${WS}/facture-b2.pdf`, 'facture_payee'])) === null, 'le second compte du bureau dépose une facture payée : accepté');
  // Règles d'origine : on ne dépose pas au nom d'un autre, ni chez une autre entreprise.
  await as(SAM);
  const e1 = await errOf(INS, [CO, WS, ALEX, 'Au nom d’Alex', `${CO}/${WS}/x1.pdf`, null]);
  check(e1?.code === '42501', 'Sam dépose avec uploaded_by = Alex : refusé par la règle d’origine documents_insert');
  const e2 = await errOf(INS, [CO2, WS2, SAM, 'Chez l’autre', `${CO2}/${WS2}/x2.pdf`, 'devis']);
  check(e2?.code === '42501', 'Sam dépose chez une autre entreprise : refusé');
  await as(ADMIN2);
  check((await errOf(`${INS} RETURNING id`, [CO2, WS2, ADMIN2, 'Facture CO2', `${CO2}/${WS2}/f-co2.pdf`, 'facture'])) === null, 'le bureau de l’autre entreprise dépose une facture chez lui : accepté');
  await as(ADMIN2);
  const e3 = await errOf(INS, [CO, WS, ADMIN2, 'Chez CO', `${CO}/${WS}/x3.pdf`, 'facture']);
  check(e3?.code === '42501', 'le bureau de CO2 ne dépose pas de facture chez CO (règle d’origine)');
  // « Annuler » d'une suppression (supprimer_document) : l'admin réinsère la ligne, même chemin.
  await as(ADMIN);
  const d0 = await addDoc({ cat: 'facture' });
  await as(ADMIN);
  check((await affected(`DELETE FROM public.documents WHERE id = $1`, [d0.id])) === 1, 'le bureau supprime une facture (règle d’origine documents_delete)');
  check((await errOf(`${INS} RETURNING id`, [CO, WS, ADMIN, 'Doc', d0.file_path, 'facture'])) === null, '« Annuler » : la ligne est réinsérée par le bureau avec le même chemin et la catégorie facture');
  // Défense en profondeur : sans le déclencheur (essai jeté), la règle restrictive de lecture refuse le RETURNING.
  const sansGarde = async (ret) => {
    await root();
    await db.exec('BEGIN');
    await db.exec('ALTER TABLE public.documents DISABLE TRIGGER documents_a_category_guard');
    await as(SAM);
    const e = await errOf(`${INS}${ret ? ' RETURNING id' : ''}`, [CO, WS, SAM, 'Sans garde', `${CO}/${WS}/sg${ret ? 1 : 2}.pdf`, 'facture']);
    await db.exec('ROLLBACK');
    await root();
    return e;
  };
  const nr = await sansGarde(false), wr = await sansGarde(true);
  check(nr === null && wr?.code === '42501' && /row-level security/.test(wr.msg),
    'sans le déclencheur (essai jeté) : l’INSERT sans RETURNING passerait, mais INSERT … RETURNING est refusé par la règle restrictive de lecture — les deux couches se complètent');
  check(await count(`SELECT count(*) n FROM public.documents WHERE label = 'Sans garde'`) === 0
    && await count(`SELECT count(*) n FROM pg_trigger WHERE tgname = 'documents_a_category_guard' AND tgenabled = 'O'`) === 1, '… l’essai est entièrement annulé et le déclencheur est de nouveau actif');
}

// ═══ E. Changement de catégorie ═════════════════════════════════════════════
section('E — Changement de catégorie : le bureau change tout, l’auteur salarié un sous-ensemble sûr, personne ne change autre chose');
let E1;
{
  E1 = await addDoc({ cat: 'devis' });
  const steps = [['devis', 'facture'], ['facture', 'autre'], ['autre', null], [null, 'plan']];
  let i = 0;
  for (const [from, to] of steps) {
    const r = await setCatN(ADMIN, E1.id, to);
    i++;
    const log = await logOf(E1.id);
    const last = log[log.length - 1];
    check(r.n === 1 && !r.e && last && last.old_category === from && last.new_category === to && last.actor_id === ADMIN && last.actor_role === 'admin' && log.length === i,
      `bureau : ${from ?? 'sans catégorie'} → ${to ?? 'sans catégorie'} : 1 ligne modifiée, trace n° ${i} (avant, après, auteur = le bureau, rôle admin)`);
  }
  const bad = await setCatN(ADMIN, E1.id, 'inconnue');
  check(bad.e?.code === '23514' && await cat(E1.id) === 'plan', 'valeur inconnue : refusée par le CHECK du lot 7 (23514), rien ne change');
  check((await logOf(E1.id)).length === 4, 'un refus ne laisse aucune trace');
  // label
  await as(ADMIN);
  check((await affected(`UPDATE public.documents SET label = 'Nouveau nom' WHERE id = $1`, [E1.id])) === 1, 'le bureau renomme un document (label) : accepté (l’assistant « modifier_document » fonctionne)');
  check((await logOf(E1.id)).length === 4, 'un changement de nom n’est pas tracé ici');
  // autres colonnes : bureau
  const cols = [['file_path', `${CO}/${WS}/ailleurs.pdf`], ['worksite_id', WS_B], ['company_id', CO2], ['uploaded_by', ALEX], ['created_at', '2020-01-01T00:00:00Z'],
    ['size_bytes', 5], ['mime_type', 'image/png'], ['file_name', 'autre.pdf'], ['work_date', '2026-01-01'], ['photo_no', 77]];
  const snap = async () => { await root(); return JSON.stringify(await one('SELECT * FROM public.documents WHERE id = $1', [E1.id])); };
  const ref = await snap();
  for (const [c, v] of cols) {
    await as(ADMIN);
    const e = await errOf(...upd(E1.id, c, v));
    check(e?.code === '42501' && /permission denied/.test(e.msg), `bureau, droit de colonne : ${c} refusé (« ${e?.msg.slice(0, 40)} »)`);
    await rootAs(ADMIN);
    const t = await errOf(...upd(E1.id, c, v));
    check(t?.code === '42501' && t.msg === 'Seule la catégorie d\'un document peut être modifiée.', `bureau, déclencheur seul : ${c} refusé (« ${t?.msg} »)`);
  }
  check(await snap() === ref, 'la ligne est strictement inchangée après ces 20 tentatives');
  // Un patch qui mêle catégorie et autre chose est refusé en entier.
  await rootAs(ADMIN);
  const mix = await errOf(`UPDATE public.documents SET category = 'devis', file_path = 'x' WHERE id = $1`, [E1.id]);
  check(mix?.code === '42501' && await cat(E1.id) === 'plan', 'catégorie + chemin dans le même patch : tout est refusé');
  // Collègue du bureau, autre entreprise
  const E2 = await addDoc({ cat: 'plan', by: ADMIN });
  check((await setCatN(ADMIN_B, E2.id, 'devis')).n === 1 && await cat(E2.id) === 'devis', 'un autre compte du bureau change la catégorie du document d’un collègue : accepté');
  const x = await setCatN(ADMIN2, E2.id, 'facture');
  check(x.n === 0 && !x.e && await cat(E2.id) === 'devis', 'le bureau d’une autre entreprise : 0 ligne, document inchangé');
  const x2 = await setCatN(AUTRE, E2.id, 'autre');
  check(x2.n === 0 && await cat(E2.id) === 'devis', 'un salarié d’une autre entreprise : 0 ligne');
  await as(ADMIN2);
  const aff = await affected(`UPDATE public.documents SET label = 'Piraté' WHERE id = $1`, [E2.id]);
  check(aff === 0, 'le bureau d’une autre entreprise ne renomme pas non plus (0 ligne)');
}
{
  // Salarié sur SON document
  const S1 = await addDoc({ cat: 'autre', by: SAM });
  const ok1 = [['autre', 'plan'], ['plan', 'devis'], ['devis', null], [null, 'pv_reception'], ['pv_reception', 'photo'], ['photo', 'autre']];
  let k = 0;
  for (const [from, to] of ok1) {
    const r = await setCatN(SAM, S1.id, to);
    k++;
    const log = await logOf(S1.id);
    const last = log[log.length - 1];
    check(r.n === 1 && !r.e && last.old_category === from && last.new_category === to && last.actor_id === SAM && last.actor_role === 'worker' && log.length === k,
      `Sam sur SON document : ${from ?? 'sans catégorie'} → ${to ?? 'sans catégorie'} accepté, trace avec rôle « worker »`);
  }
  for (const [c, msg] of [['facture', 'Les factures sont réservées au bureau.'], ['facture_payee', 'Les factures sont réservées au bureau.'], ['reserve', 'Cette catégorie est réservée au bureau.']]) {
    const r = await setCatN(SAM, S1.id, c);
    check(r.e?.code === '42501' && r.e.msg === msg && await cat(S1.id) === 'autre', `Sam : → ${c} refusé (42501 « ${r.e?.msg} »)`);
  }
  const R1 = await addDoc({ cat: 'reserve', by: SAM });
  const rr = await setCatN(SAM, R1.id, 'autre');
  check(rr.e?.code === '42501' && rr.e.msg === 'Cette catégorie est réservée au bureau.' && await cat(R1.id) === 'reserve', 'Sam : son document « reserve » → autre refusé (il alimente le rapport de réserves)');
  const rr2 = await setCatN(SAM, R1.id, null);
  check(rr2.e?.code === '42501' && await cat(R1.id) === 'reserve', 'Sam : son document « reserve » → sans catégorie refusé aussi');
  check((await setCatN(ADMIN, R1.id, 'autre')).n === 1, '… le bureau, lui, peut le faire');
  check((await setCatN(ADMIN, R1.id, 'reserve')).n === 1, '… et le remettre en réserve');
  const F1 = await addDoc({ cat: 'facture', by: SAM });
  const ff = await setCatN(SAM, F1.id, 'autre');
  check(ff.n === 0 && !ff.e && await cat(F1.id) === 'facture', 'Sam : sa propre facture (posée avant la migration) → autre : 0 ligne (il ne la voit plus)');
  // Autres colonnes par le salarié
  await as(SAM);
  const lab = await errOf(`UPDATE public.documents SET label = 'Renommé' WHERE id = $1`, [S1.id]);
  check(lab?.code === '42501' && lab.msg === 'Seule la catégorie d\'un document peut être modifiée.', `Sam : renommer son document refusé (le nom est réservé au bureau) : « ${lab?.msg} »`);
  const lab2 = await errOf(`UPDATE public.documents SET category = 'plan', label = 'Renommé' WHERE id = $1`, [S1.id]);
  check(lab2?.code === '42501' && await cat(S1.id) === 'autre', 'Sam : catégorie ET nom dans le même patch : tout est refusé');
  const sCols = [['file_path', `${CO}/${WS}/ailleurs.pdf`], ['uploaded_by', ALEX], ['company_id', CO2], ['worksite_id', WS_B], ['created_at', '2020-01-01T00:00:00Z'], ['size_bytes', 5], ['mime_type', 'image/png'], ['file_name', 'z.pdf'], ['work_date', '2026-01-01'], ['photo_no', 9], ['id', '99999999-9999-9999-9999-999999999999']];
  const snapS = async () => { await root(); return JSON.stringify(await one('SELECT * FROM public.documents WHERE id = $1', [S1.id])); };
  const refS = await snapS();
  for (const [c, v] of sCols) {
    await as(SAM);
    const e = await errOf(...upd(S1.id, c, v));
    check(e?.code === '42501' && /permission denied/.test(e.msg), `Sam, droit de colonne : ${c} refusé`);
    await rootAs(SAM);
    const t = await errOf(...upd(S1.id, c, v));
    check(t?.code === '42501' && t.msg === 'Seule la catégorie d\'un document peut être modifiée.', `Sam, déclencheur seul : ${c} refusé (« ${t?.msg} »)`);
  }
  check(await snapS() === refS, 'le document de Sam est strictement inchangé après ces 22 tentatives');
  // Sans effet
  const nLog = (await logOf(S1.id)).length;
  const same = await setCatN(SAM, S1.id, 'autre');
  check(same.n === 1 && !same.e && (await logOf(S1.id)).length === nLog, 'mise à jour « sans effet » (même catégorie) : accepte, ne laisse pas de trace');
  // Collègue, chef, archivé
  const AL = await addDoc({ cat: 'autre', by: ALEX });
  const c1 = await setCatN(SAM, AL.id, 'plan');
  check(c1.n === 0 && !c1.e && await cat(AL.id) === 'autre', 'Sam sur le document d’Alex : 0 ligne, inchangé');
  await as(SAM);
  check((await affected(`UPDATE public.documents SET category = category WHERE id = $1`, [AL.id])) === 0, '… même une mise à jour « sans effet »');
  const c2 = await setCatN(CHEF, AL.id, 'plan');
  check(c2.n === 0 && await cat(AL.id) === 'autre', 'le chef d’équipe sur le document d’Alex : 0 ligne (c’est un salarié)');
  const CH = await addDoc({ cat: null, by: CHEF });
  check((await setCatN(CHEF, CH.id, 'devis')).n === 1 && (await setCatN(CHEF, CH.id, 'facture')).e?.code === '42501', 'le chef d’équipe sur SON document : devis accepté, facture refusée');
  const AN = await addDoc({ cat: 'autre', by: ANCIEN });
  const c3 = await setCatN(ANCIEN, AN.id, 'plan');
  check(c3.n === 0 && !c3.e && await cat(AN.id) === 'autre', 'salarié archivé : 0 ligne');
  const AU = await addDoc({ cat: 'autre', by: AUTRE, co: CO2, ws: WS2 });
  check((await setCatN(AUTRE, AU.id, 'plan')).n === 1 && (await setCatN(AUTRE, AU.id, 'facture')).e?.code === '42501', 'salarié de l’autre entreprise sur SON document : même règle (plan accepté, facture refusée)');
  // Le salarié ne sort pas un document de son entreprise
  const sw = await setCatN(SAM, S1.id, 'plan');
  check(sw.n === 1, 'contrôle : Sam peut encore corriger son document après tous ces refus');
  // Appel direct de la fonction du déclencheur : fermée
  await as(SAM);
  check(await err('SELECT public.guard_document_category()') === '42501' && await err('SELECT public.log_document_category()') === '42501', 'fonctions de déclencheur appelées à la main : refusées');
  // root (pas d'auth.uid) : non contrôlé, trace avec auteur NULL
  await root();
  const nl = (await logOf(E1.id)).length;
  const rt = await affected(`UPDATE public.documents SET file_path = $2, category = 'facture' WHERE id = $1`, [E1.id, E1.file_path]);
  const lg = await logOf(E1.id);
  check(rt === 1 && lg.length === nl + 1 && lg[lg.length - 1].actor_id === null && lg[lg.length - 1].actor_role === null, 'éditeur SQL / clé de service (pas d’auth.uid) : non contrôlé (documenté), trace avec auteur vide');
  // annulation
  const U = await addDoc({ cat: 'devis' });
  await setCatN(ADMIN, U.id, 'facture');
  await setCatN(ADMIN, U.id, 'devis');
  const ul = await logOf(U.id);
  check(ul.length === 2 && ul[1].old_category === 'facture' && ul[1].new_category === 'devis', '« Annuler » (retour à l’ancienne valeur) : une deuxième ligne de trace');
}
{
  // Ordre des déclencheurs : le contrôle passe AVANT le recalage de work_date.
  await root();
  const te = await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, '2026-10-01', '08:00', '12:00', 'draft') RETURNING id`, [CO, SAM, WS]);
  const L = await addDoc({ cat: 'autre', by: SAM, te: te.id });
  check(JSON.stringify((await one('SELECT work_date::text AS w FROM public.documents WHERE id = $1', [L.id])).w) === '"2026-10-01"', 'document rattaché à une intervention : work_date posé par la base (2026-10-01)');
  await root();
  await db.query(`UPDATE public.time_entries SET work_date = '2026-10-02' WHERE id = $1`, [te.id]);
  const r = await setCatN(SAM, L.id, 'plan');
  await root();
  const w = (await one('SELECT work_date::text AS w, category FROM public.documents WHERE id = $1', [L.id]));
  check(r.n === 1 && !r.e && w.category === 'plan' && w.w === '2026-10-02', 'le jour de l’intervention a changé depuis l’envoi : Sam change la catégorie SANS erreur (le contrôle passe avant) et work_date est recalé comme avant (2026-10-02)');
}

// ═══ F. Trace ═══════════════════════════════════════════════════════════════
section('F — Trace : lecture par le bureau de l’entreprise seulement, écriture par déclencheur seulement');
{
  await as(ADMIN2);
  const ownDoc = await addDoc({ cat: 'devis', co: CO2, ws: WS2, by: ADMIN2 });
  await setCatN(ADMIN2, ownDoc.id, 'facture');
  await root();
  const totCO = await count(`SELECT count(*) n FROM public.document_category_log WHERE company_id = '${CO}'`);
  const totCO2 = await count(`SELECT count(*) n FROM public.document_category_log WHERE company_id = '${CO2}'`);
  const tot = await count('SELECT count(*) n FROM public.document_category_log');
  check(totCO > 20 && totCO2 === 2 && tot === totCO + totCO2, `la trace contient ${totCO} lignes de CO et ${totCO2} de CO2`);
  await as(SAM);
  check(await count('SELECT count(*) n FROM public.document_category_log') === 0, 'Sam lit 0 ligne de trace');
  await as(CHEF);
  check(await count('SELECT count(*) n FROM public.document_category_log') === 0, 'le chef d’équipe lit 0 ligne de trace');
  await as(ADMIN);
  check(await count('SELECT count(*) n FROM public.document_category_log') === totCO && await count(`SELECT count(*) n FROM public.document_category_log WHERE company_id <> '${CO}'`) === 0, 'le bureau lit les lignes de CO, et celles-là seulement');
  await as(ADMIN2);
  check(await count('SELECT count(*) n FROM public.document_category_log') === 2, 'le bureau de CO2 lit uniquement les 2 lignes de CO2');
  await as(AUTRE);
  check(await count('SELECT count(*) n FROM public.document_category_log') === 0, 'le salarié de CO2 : 0');
  await as(ANCIEN);
  check(await count('SELECT count(*) n FROM public.document_category_log') === 0, 'le salarié archivé : 0');
  const w = `INSERT INTO public.document_category_log (company_id, document_id) VALUES ('${CO}', '${D.devis.id}')`;
  for (const [nom, uid, role] of [['le bureau', ADMIN, 'authenticated'], ['Sam', SAM, 'authenticated'], ['anon', null, 'anon']]) {
    await as(uid, role);
    const r = [await err(w), await err(`UPDATE public.document_category_log SET new_category = 'x'`), await err('DELETE FROM public.document_category_log'), await err('TRUNCATE public.document_category_log')];
    check(r.every((c) => c === '42501'), `${nom} : INSERT / UPDATE / DELETE / TRUNCATE sur la trace refusés (${r.join(', ')})`);
  }
  await as(ADMIN);
  check(await err(`SELECT nextval('public.document_category_log_id_seq')`) === '42501', 'la séquence de la trace est fermée');
  await root();
  check(await count('SELECT count(*) n FROM public.document_category_log') === tot, 'la trace n’a pas bougé après ces abus');
  const ix = await one(`SELECT (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.document_category_log'::regclass AND contype = 'f')::int AS fk`);
  check(ix.fk === 0, 'aucune clé étrangère sur la trace (elle survit au document, et ne bloque jamais une suppression)');
}

// ═══ G. my_trainings ════════════════════════════════════════════════════════
section('G — my_trainings() : un document devenu facture n’est plus rendu au salarié');
{
  const mine = async (uid) => { await as(uid); return rows('SELECT id, kind, document_name, document_path FROM public.my_trainings()'); };
  let m = await mine(SAM);
  check(m.length === 2 && m.find((x) => x.id === T.doc)?.document_path === D.devis.file_path, 'devis : Sam voit la formation « document » (et la vidéo)');
  await root();
  const lien = await one('SELECT category FROM public.documents WHERE id = $1', [D.devis.id]);
  check(lien.category !== 'facture', 'état de départ : le document lié n’est pas une facture');
  await setCatN(ADMIN, D.devis.id, 'facture');
  m = await mine(SAM);
  check(m.length === 1 && m[0].kind === 'video' && !m.some((x) => x.document_name || x.document_path), 'ADMIN passe le document lié en facture : Sam ne voit plus que la vidéo (aucun nom, aucun chemin)');
  m = await mine(CHEF);
  check(m.length === 1 && m[0].kind === 'video', 'le chef d’équipe : idem');
  await setCatN(ADMIN, D.devis.id, 'facture_payee');
  check((await mine(SAM)).length === 1, 'facture payée : idem');
  await setCatN(ADMIN, D.devis.id, 'devis');
  m = await mine(SAM);
  check(m.length === 2 && m.some((x) => x.id === T.doc && x.document_name), 'retour à « devis » : la formation revient chez Sam');
  m = await mine(ADMIN);
  check(m.length === 0, 'un compte bureau n’a toujours pas de formations (inchangé)');
  await as(ADMIN);
  const ad = await rows('SELECT id FROM public.trainings');
  check(ad.length === 2, 'le bureau voit toujours les 2 formations dans son propre écran');
  await as(null, 'anon');
  check(await err('SELECT * FROM public.my_trainings()') === '42501', 'anon : my_trainings refusée (droits du lot 6 conservés)');
}

// ═══ H. Cohabitation avec le lot 29 ═════════════════════════════════════════
section('H — Cohabitation avec le lot 29 : documents_insert, documents_delete (et _select) réécrites avec (SELECT …) par ALTER POLICY');
{
  await root();
  await db.exec(`ALTER POLICY documents_insert ON public.documents WITH CHECK (company_id = (SELECT public.get_my_company_id()) AND uploaded_by = (SELECT auth.uid()));
    ALTER POLICY documents_delete ON public.documents USING (company_id = (SELECT public.get_my_company_id()) AND ((SELECT public.is_admin()) OR uploaded_by = (SELECT auth.uid())));
    ALTER POLICY documents_select ON public.documents USING (company_id = (SELECT public.get_my_company_id()));`);
  const pols = (await rows(`SELECT policyname FROM pg_policies WHERE tablename = 'documents' ORDER BY 1`)).map((p) => p.policyname);
  check(JSON.stringify(pols) === JSON.stringify(['documents_delete', 'documents_factures_bureau', 'documents_insert', 'documents_select', 'documents_update_categorie', 'support_read']), 'les règles du lot 24 sont toujours là après ces ALTER POLICY');
  await dFacturesAbuse('lot 29 : ');
  for (const [nom, uid] of [['Sam', SAM], ['Alex', ALEX], ['chef', CHEF]]) {
    check(await nDocs(uid, INV) === 0, `lot 29 : ${nom} ne lit toujours aucune facture`);
  }
  check(await nDocs(ADMIN, INV) >= 3, 'lot 29 : le bureau lit toujours les factures');
  check(!(await seesRow(SAM, D.factSam.id)), 'lot 29 : la facture de Sam lui reste invisible');
  await as(SAM);
  check((await affected(`DELETE FROM public.documents WHERE id = $1`, [D.factSam.id])) === 0, 'lot 29 : son DELETE (avec filtre) sur une facture : toujours 0 ligne');
  check(!(await canReadFile(SAM, D.fact.file_path)) && await canReadFile(ADMIN, D.fact.file_path), 'lot 29 : le fichier d’une facture : toujours illisible du salarié, lisible du bureau');
  const H1 = await addDoc({ cat: 'autre', by: SAM });
  check((await setCatN(SAM, H1.id, 'plan')).n === 1 && (await setCatN(SAM, H1.id, 'facture')).e?.code === '42501', 'lot 29 : Sam corrige sa catégorie (plan) et se voit refuser facture');
  await as(SAM);
  check(await err(INS, [CO, WS, ALEX, 'Au nom d’Alex', `${CO}/${WS}/h1.pdf`, null]) === '42501', 'lot 29 : documents_insert réécrite refuse toujours uploaded_by ≠ moi');
  const dd = await addDoc({ cat: 'devis', by: SAM });
  await as(SAM);
  check((await affected(`DELETE FROM public.documents WHERE id = $1`, [dd.id])) === 1, 'lot 29 : Sam supprime encore SON devis (documents_delete réécrite)');
}

// ═══ A (fin). Retour arrière et remise ══════════════════════════════════════
section('A — Retour arrière (extrait des commentaires du fichier) puis remise de la migration');
{
  await root();
  const polsAvant = await one(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname = ANY($1)`, [NEW_POLICIES]);
  const logN = await count('SELECT count(*) n FROM public.document_category_log');
  // 1) Dans une transaction annulée : on regarde l'état, puis tout revient.
  await db.exec('BEGIN');
  const e1 = await errExec(ROLLBACK_SQL);
  check(e1 === null, `le retour arrière s’exécute sans erreur${e1 ? ` : ${e1}` : ''}`);
  const g = await one(`SELECT (SELECT count(*) FROM pg_policies WHERE policyname = ANY($1))::int AS p, (SELECT count(*) FROM pg_proc WHERE proname = ANY($2))::int AS f,
    (SELECT count(*) FROM pg_trigger WHERE tgname = ANY($3))::int AS t, (SELECT count(*) FROM pg_indexes WHERE indexname = 'documents_facture_path_idx')::int AS i,
    has_table_privilege('authenticated', 'public.documents', 'UPDATE') AS u, to_regclass('public.document_category_log') IS NOT NULL AS tr`, [NEW_POLICIES, NEW_FNS, NEW_TRIGGERS]);
  check(g.p === 1 && g.f === 0 && g.t === 0 && g.i === 0, `règles, fonctions, déclencheurs, index retirés (il ne reste que la lecture de la trace : ${g.p} règle)`);
  check(g.u === true, 'authenticated retrouve le droit UPDATE d’origine sur documents');
  check(g.tr && await count('SELECT count(*) n FROM public.document_category_log') === logN, 'la trace et son contenu sont GARDÉS');
  const tr = await myTrainingsDef();
  check(tr.def === trBefore.def && tr.acl === trBefore.acl, 'my_trainings() redevient celle du lot 6 (définition et droits identiques à avant)');
  await as(SAM);
  check(await count(`SELECT count(*) n FROM public.documents WHERE ${INV}`) === 3 || await count(`SELECT count(*) n FROM public.documents WHERE ${INV}`) >= 3, 'après retour arrière les salariés revoient les factures (comportement d’avant)');
  check(await canReadFile(SAM, D.fact.file_path), '… et leurs fichiers');
  await root();
  await db.exec('ROLLBACK');
  const v0 = await one(POST_SQL);
  check(Object.values(v0).every((x) => x === true), 'retour arrière jeté (transaction annulée) : la vérification redonne 13 × true');
  // 2) Pour de vrai : retrait validé, puis remise de la migration.
  await db.exec(ROLLBACK_SQL);
  const vOff = await one(POST_SQL);
  check(Object.values(vOff).filter((x) => x === true).length < 13, 'retour arrière appliqué : la vérification n’est plus à 13 × true');
  check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
  const v = await one(POST_SQL);
  check(Object.keys(v).length === 13 && Object.values(v).every((x) => x === true), 'remise de la migration : vérification de nouveau 13 × true');
  await as(SAM);
  check(await count(`SELECT count(*) n FROM public.documents WHERE ${INV}`) === 0 && !(await canReadFile(SAM, D.fact.file_path)), 'remise : Sam ne voit plus ni les factures ni leurs fichiers');
  await root();
  check(await count('SELECT count(*) n FROM public.document_category_log') === logN, 'la trace est restée intacte pendant tout l’aller-retour');
  check((await one(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname = ANY($1)`, [NEW_POLICIES])).n === polsAvant.n, 'mêmes règles qu’avant l’aller-retour');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
