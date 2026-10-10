// Formations (lot 6, oct. 2026). Rejoué POUR DE VRAI sur un Postgres jetable
// (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:formations-db
//
// Même bouchon que les lots 2, 4, 11, 12 et 14 (fonctions et policies de
// PRODUCTION recopiées mot pour mot), plus la table `documents` avec ses QUATRE
// policies de production (select, insert, delete, support_read) et les droits
// PAR DÉFAUT de production (tout pour anon / authenticated sur les objets neufs)
// — pour prouver que la migration les reprend bien. La migration est chargée
// TELLE QUELLE, deux fois ; puis son RETOUR ARRIÈRE (décommenté) est exécuté, et
// elle est rechargée.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_FILE = fs.readdirSync(path.join(here, '..', 'migrations')).find((f) => f.endsWith('_lot6_formations.sql'));
const SQL = fs.readFileSync(path.join(here, '..', 'migrations', MIG_FILE), 'utf8');
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
const NINA = '40000000-0000-0000-0000-000000000004'; // arrive APRÈS les formations « toute l'équipe »
const ANCIEN = '60000000-0000-0000-0000-000000000006'; // salarié archivé
const AUTRE = '70000000-0000-0000-0000-000000000007'; // salarié de l'autre entreprise
const WS = 'e0000000-0000-0000-0000-000000000001', WS2 = 'e0000000-0000-0000-0000-000000000002';
const DOC = 'd0000000-0000-0000-0000-000000000001', DOC_SAM = 'd0000000-0000-0000-0000-000000000002', DOC2 = 'd0000000-0000-0000-0000-000000000003';

const EXTRA = `
-- La table documents de PRODUCTION (colonnes et quatre policies, lues le 10/10/2026).
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
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'), ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'), ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Test'), ('${ANCIEN}', '${CO}', 'worker', false, 'Ancien', 'Test'),
  ('${AUTRE}', '${CO2}', 'worker', true, 'Autre', 'Salarié');
INSERT INTO public.worksites (id, company_id, client_name) VALUES ('${WS}', '${CO}', 'Villa Exemple'), ('${WS2}', '${CO2}', 'Autre');
INSERT INTO public.documents (id, company_id, worksite_id, uploaded_by, label, file_path, file_name, mime_type) VALUES
  ('${DOC}', '${CO}', '${WS}', '${ADMIN}', 'Livret sécurité', '${CO}/${WS}/a.pdf', 'livret.pdf', 'application/pdf'),
  ('${DOC_SAM}', '${CO}', '${WS}', '${SAM}', NULL, '${CO}/${WS}/b.pdf', 'notice.pdf', 'application/pdf'),
  ('${DOC2}', '${CO2}', '${WS2}', '${ADMIN2}', 'Autre', '${CO2}/${WS2}/c.pdf', 'c.pdf', 'application/pdf');
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
/** Code d'erreur Postgres (ou message) ; null = accepté. */
const err = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return e.code || e.message; } };
const errMsg = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return `${e.code || ''} ${e.message}`; } };
const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];
const count = async (sql, p = []) => Number((await one(sql, p)).n);

/** Les lignes SQL commentées du fichier entre deux repères (comme les tests des lots 4 et 7). */
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
const NEW_TABLES = ['trainings', 'training_views'];
const NEW_FNS = ['guard_training_write', 'my_trainings', 'set_training_seen'];

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
section('Migration : additive, rejouable, droits repris malgré les droits par défaut');
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND NOT (proname = ANY($1))`, [NEW_FNS])).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s
  FROM pg_policies WHERE NOT (tablename = ANY($1))`, [NEW_TABLES])).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s
  FROM pg_trigger WHERE NOT tgisinternal AND tgname <> 'trainings_guard_write'`)).s;
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
check(/^20261010210000_lot6_formations\.sql$/.test(MIG_FILE) && MIG_FILE > '20261010190000_lot5_journal_relances.sql', `fichier ${MIG_FILE} (après le lot 5)`);
await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (get_my_company_id, is_admin, gardes des heures…)');
check(before.pol === after.pol, 'policies existantes inchangées (documents et ses 4 policies, time_entries…)');
check(before.trg === after.trg, 'triggers existants inchangés (seul trainings_guard_write est ajouté, sur la table neuve)');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée sur les tables existantes');
check(before.priv === after.priv, 'droits des tables existantes inchangés');
{
  // Hors corps de fonction ($fn$ … $fn$) et avant le bloc de retour arrière : rien qui retire ou renomme.
  const head = SQL.split('-- ── DÉBUT DU RETOUR ARRIÈRE ──')[0];
  const outside = head.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/^\s*--.*$/gm, '');
  check(!/\b(DROP\s+(TABLE|COLUMN|FUNCTION)|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|DELETE\s+FROM|UPDATE\s+public\.|TRUNCATE)\b/i.test(outside),
    'migration additive : aucun DROP TABLE / COLUMN / FUNCTION, RENAME, ALTER, DELETE, UPDATE ni TRUNCATE hors des corps de fonction (hors retour arrière)');
  const dels = [...head.matchAll(/DELETE\s+FROM\s+([\w.]+)[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' '));
  const fnSeen = (head.match(/FUNCTION public\.set_training_seen[\s\S]*?END \$fn\$;/) || [''])[0];
  check(dels.length === 1 && /^DELETE FROM public\.training_views v WHERE v\.training_id = p_training AND v\.user_id = v_me AND v\.seen_at > now\(\) - interval '10 minutes';$/.test(dels[0]) && fnSeen.includes(dels[0].split(' WHERE')[0]),
    `un seul effacement dans tout le fichier : « Annuler » dans set_training_seen, SA ligne, 10 minutes (${dels.length})`);
}
check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 10 && bad.length === 0, `vérification après application : 10 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}
{
  const pols = await rows(`SELECT tablename, string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) AS s FROM pg_policies WHERE tablename = ANY($1) GROUP BY 1 ORDER BY 1`, [NEW_TABLES]);
  const by = Object.fromEntries(pols.map((r) => [r.tablename, r.s]));
  check(by.trainings === 'trainings_office_insert:INSERT,trainings_office_select:SELECT,trainings_office_update:UPDATE', `trainings : 3 policies bureau, aucune DELETE (${by.trainings})`);
  check(by.training_views === 'training_views_select:SELECT', `training_views : lecture seule (${by.training_views})`);
  check(!Object.values(by).join(',').includes('support'), 'pas de policy « support_read » : lecture limitée à l’entreprise');
  const r = await rows(`SELECT t, p, role FROM unnest($1::text[]) t, unnest(ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER']) p, unnest(ARRAY['authenticated','anon']) role
    WHERE has_table_privilege(role, 'public.' || t, p)`, [NEW_TABLES]);
  check(r.length === 0, `ni DELETE, ni TRUNCATE, ni REFERENCES, ni TRIGGER pour anon / authenticated (${r.map((x) => `${x.role}:${x.t}:${x.p}`).join(' ') || 'aucun'})`);
  const anon = await rows(`SELECT t FROM unnest($1::text[]) t WHERE has_any_column_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE')`, [NEW_TABLES]);
  check(anon.length === 0, 'anon : aucun droit sur les 2 tables (ni table, ni colonne)');
  const cols = async (t, priv) => (await rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1
    AND has_column_privilege('authenticated', 'public.' || $1, column_name, $2) ORDER BY ordinal_position`, [t, priv])).map((x) => x.c).join(',');
  const ins = await cols('trainings', 'INSERT'), upd = await cols('trainings', 'UPDATE');
  check(ins === 'company_id,title,kind,video_url,document_id,all_team,assignee_ids', `trainings : insertion permise sur ${ins} seulement (ni id, ni created_by, ni created_at, ni archived_at)`);
  check(upd === 'title,kind,video_url,document_id,all_team,assignee_ids,archived_at', `trainings : modification permise sur ${upd} seulement (ni company_id, ni created_by, ni created_at)`);
  check(await cols('training_views', 'INSERT') === '' && await cols('training_views', 'UPDATE') === '', 'training_views : aucune insertion ni modification directe');
  const fns = await one(`SELECT count(*)::int AS n, bool_and(prosecdef) AS d, bool_and(array_to_string(proconfig, ',') = 'search_path=""') AS s,
    bool_or(has_function_privilege('anon', oid, 'EXECUTE')) AS a FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [NEW_FNS]);
  const exec = await one(`SELECT has_function_privilege('authenticated', 'public.my_trainings()', 'EXECUTE') AS m, has_function_privilege('authenticated', 'public.set_training_seen(uuid, boolean)', 'EXECUTE') AS s,
    has_function_privilege('authenticated', 'public.guard_training_write()', 'EXECUTE') AS g`);
  check(fns.n === 3 && fns.d && fns.s && !fns.a && exec.m && exec.s && !exec.g, 'fonctions : SECURITY DEFINER, search_path vide, anon exclu ; la garde n’est appelable par personne');
}

// ═══ Le lien : la base refuse elle-même ════════════════════════════════════
section('Lien vidéo : contrôlé par la base');
const INS = `INSERT INTO public.trainings (company_id, title, kind, video_url, document_id, all_team, assignee_ids) VALUES ($1,$2,$3,$4,$5,$6,$7::uuid[]) RETURNING *`;
const vid = (url, x = {}) => [x.co ?? CO, x.title ?? 'Port du harnais', 'video', url, null, x.all ?? true, x.ids ?? '{}'];
await as(ADMIN);
const t1 = await one(INS, vid('https://youtu.be/abc'));
check(!!t1?.id && t1.created_by === ADMIN && t1.archived_at === null && t1.all_team === true, 'bureau : vidéo YouTube pour toute l’équipe (created_by = le bureau, non retirée)');
for (const bad of ['javascript:alert(1)', 'http://youtu.be/abc', 'https://evil.com/x', 'https://youtube.com.evil.com/x', 'https://user@youtube.com/x',
  'https://youtube.com:8080/x', 'https://youtube.com/a b', 'https://youtube.com/a\\b', 'https://youtube.com/"><script>', 'https://youtube.com', `https://youtu.be/${'a'.repeat(490)}`, 'data:text/html,x']) {
  check(await err(INS, vid(bad)) === '23514', `lien refusé par la base (23514) : ${bad.slice(0, 40)}`);
}
for (const good of ['https://www.youtube.com/watch?v=x&t=30s', 'https://m.youtube.com/shorts/x', 'https://vimeo.com/123', 'https://player.vimeo.com/video/1',
  'https://drive.google.com/file/d/ID/view?usp=sharing', 'https://docs.google.com/presentation/d/ID/edit#slide=id.p']) {
  check(await err(INS, vid(good)) === null, `lien accepté : ${good}`);
}

section('Source, titre, public, droits par colonne');
check(await err(INS, [CO, 'Doc', 'document', null, null, true, '{}']) === '22023', 'document sans document : refusé (22023 « Choisissez un document. »)');
check(await err(INS, [CO, 'Doc', 'document', null, DOC2, true, '{}']) === '42501', 'document d’une autre entreprise : refusé (42501)');
check(await err(INS, [CO, 'Doc', 'document', null, 'd0000000-0000-0000-0000-0000000000ff', true, '{}']) === '42501', 'document inconnu : même refus (pas d’oracle d’existence)');
check(await err(INS, [CO, 'Doc', 'video', 'https://youtu.be/a', DOC, true, '{}']) === '23514', 'vidéo + document : refusé');
check(await err(INS, [CO, ' x ', 'video', 'https://youtu.be/a', null, true, '{}']) === '23514', 'titre d’un caractère : refusé');
check(await err(INS, [CO, 'y'.repeat(121), 'video', 'https://youtu.be/a', null, true, '{}']) === '23514', 'titre de plus de 120 caractères : refusé');
const tDoc = await one(INS, [CO, '  Livret  ', 'document', null, DOC_SAM, false, `{${SAM}}`]);
check(tDoc?.title === 'Livret' && tDoc.document_id === DOC_SAM, 'document de l’entreprise pour Sam (titre nettoyé)');
check(await err(INS, vid('https://youtu.be/a', { all: false, ids: '{}' })) === '22023', 'aucun destinataire : refusé');
check(await err(INS, vid('https://youtu.be/a', { all: false, ids: `{${AUTRE}}` })) === '42501', 'salarié d’une autre entreprise : refusé');
check(await err(INS, vid('https://youtu.be/a', { all: false, ids: `{${ANCIEN}}` })) === '42501', 'salarié archivé : refusé');
check(await err(INS, vid('https://youtu.be/a', { all: false, ids: `{${ADMIN}}` })) === '42501', 'le bureau comme destinataire : refusé');
const tAlex = await one(INS, vid('https://youtu.be/alex', { all: false, ids: `{${ALEX},${ALEX},${CHEF}}` }));
check(tAlex.assignee_ids.length === 2 && tAlex.assignee_ids.includes(ALEX) && tAlex.assignee_ids.includes(CHEF), `Alex (en double) + chef : doublons retirés (${tAlex.assignee_ids.length})`);
const tAll = await one(INS, vid('https://youtu.be/b', { all: true, ids: `{${ALEX}}` }));
check(tAll.assignee_ids.length === 0, '« Toute l’équipe » : la liste est vidée');
check(await err(INS, vid('https://youtu.be/a', { co: CO2 })) === '42501', 'bureau : formation pour une autre entreprise refusée (RLS)');
check(await err(`INSERT INTO public.trainings (id, company_id, title, kind, video_url) VALUES (gen_random_uuid(), $1, 'x2', 'video', 'https://youtu.be/a')`, [CO]) === '42501', 'refus : id envoyé par le client');
check(await err(`INSERT INTO public.trainings (company_id, title, kind, video_url, created_by) VALUES ($1, 'x2', 'video', 'https://youtu.be/a', $2)`, [CO, SAM]) === '42501', 'refus : created_by envoyé (ni oublié, ni falsifié)');
check(await err(`INSERT INTO public.trainings (company_id, title, kind, video_url, archived_at) VALUES ($1, 'x2', 'video', 'https://youtu.be/a', now())`, [CO]) === '42501', 'refus : archived_at à l’insertion');
check(await err(`UPDATE public.trainings SET created_by = $2 WHERE id = $1`, [t1.id, SAM]) === '42501', 'refus : modifier created_by');
check(await err(`UPDATE public.trainings SET company_id = $2 WHERE id = $1`, [t1.id, CO2]) === '42501', 'refus : modifier company_id');
check(await err(`UPDATE public.trainings SET created_at = '2020-01-01' WHERE id = $1`, [t1.id]) === '42501', 'refus : modifier created_at');
check(await err(`DELETE FROM public.trainings WHERE id = $1`, [t1.id]) === '42501', 'bureau : aucun effacement (DELETE refusé : on « retire »)');

// ═══ Le salarié ════════════════════════════════════════════════════════════
section('Salarié : ne lit pas la table, voit SES formations, coche « Vue » pour lui seul');
await as(SAM);
check((await rows('SELECT * FROM public.trainings')).length === 0, 'Sam : ne lit aucune ligne de la table');
check(await err(INS, vid('https://youtu.be/a')) === '42501', 'Sam : n’ajoute pas de formation');
check((await rows(`UPDATE public.trainings SET title = 'pirate' RETURNING id`)).length === 0, 'Sam : ne modifie rien (0 ligne)');
check(await err('DELETE FROM public.trainings') === '42501', 'Sam : DELETE refusé (aucun droit)');
let mine = await rows('SELECT * FROM public.my_trainings()');
let ids = new Set(mine.map((r) => r.id));
check(ids.has(t1.id) && ids.has(tDoc.id) && ids.has(tAll.id) && !ids.has(tAlex.id), `Sam voit « toute l’équipe » + la sienne, pas celle d’Alex et du chef (${mine.length})`);
check(Object.keys(mine[0]).join(',') === 'id,title,kind,video_url,document_name,document_path,document_mime,created_at,seen_at', 'my_trainings : ni la liste des destinataires, ni les « Vue » des autres');
const md = mine.find((r) => r.id === tDoc.id);
check(md?.document_name === 'notice.pdf' && md.document_path === `${CO}/${WS}/b.pdf` && md.video_url === null, 'document : nom (fichier, faute de libellé) et chemin rendus');
check(await err('SELECT public.set_training_seen($1)', [tAlex.id]) === 'P0002', 'Sam ne coche pas celle d’Alex (P0002)');
const s1 = (await one('SELECT public.set_training_seen($1) AS at', [t1.id])).at;
const s2 = (await one('SELECT public.set_training_seen($1, true) AS at', [t1.id])).at;
check(!!s1 && String(s1) === String(s2), 'Sam coche « Vue » ; un deuxième appel rend la même date (idempotent)');
check(await err(`INSERT INTO public.training_views (training_id, user_id, company_id, seen_at) VALUES ($1, $2, $3, '2020-01-01')`, [tAlex.id, ALEX, CO]) === '42501', 'Sam ne fabrique pas une « Vue » pour Alex');
check(await err(`INSERT INTO public.training_views (training_id, user_id, company_id, seen_at) VALUES ($1, $2, $3, '2020-01-01')`, [tAll.id, SAM, CO]) === '42501', 'Sam ne fabrique pas une « Vue » antidatée pour lui');
check(await err(`UPDATE public.training_views SET seen_at = '2020-01-01'`) === '42501', 'Sam ne change pas la date de sa « Vue »');
check((await rows('SELECT * FROM public.training_views')).length === 1, 'Sam lit ses « Vue » seulement');
check((await one('SELECT seen_at FROM public.my_trainings() WHERE id = $1', [t1.id])).seen_at !== null, 'my_trainings : « Vue » rendue pour Sam');
check(await err('SELECT public.set_training_seen($1, false)', [t1.id]) === null, 'Sam : « Annuler » tout de suite');
check((await one('SELECT seen_at FROM public.my_trainings() WHERE id = $1', [t1.id])).seen_at === null, '… la « Vue » est retirée');
check(await err('SELECT public.set_training_seen($1, false)', [t1.id]) === null, '« Annuler » sans « Vue » : rien à faire, pas d’erreur');
await one('SELECT public.set_training_seen($1)', [t1.id]);
await root();
await db.query(`UPDATE public.training_views SET seen_at = now() - interval '11 minutes' WHERE user_id = $1`, [SAM]);
await as(SAM);
check((await errMsg('SELECT public.set_training_seen($1, false)', [t1.id]) || '').includes('Trop tard'), '« Annuler » après 10 minutes : refusé (« Trop tard pour annuler »)');
mine = await rows('SELECT id, seen_at FROM public.my_trainings()');
check(mine[mine.length - 1]?.id === t1.id && mine.slice(0, -1).every((r) => r.seen_at === null), 'my_trainings : les « pas encore vues » d’abord');

section('Chef d’équipe, nouveau venu, autres comptes');
await as(CHEF);
check((await rows('SELECT id FROM public.my_trainings()')).some((r) => r.id === tAlex.id), 'chef d’équipe destinataire : la voit');
check(await err('SELECT public.set_training_seen($1)', [tAlex.id]) === null, 'chef d’équipe destinataire : coche « Vue »');
await root();
await db.query(`INSERT INTO public.users VALUES ($1, $2, 'worker', true, 'Nina', 'Test')`, [NINA, CO]);
await as(NINA);
ids = new Set((await rows('SELECT id FROM public.my_trainings()')).map((r) => r.id));
check(ids.has(t1.id) && ids.has(tAll.id) && !ids.has(tDoc.id) && !ids.has(tAlex.id), 'Nina, arrivée APRÈS : voit les formations « toute l’équipe » plus anciennes, pas les autres');
await as(AUTRE);
check((await rows('SELECT * FROM public.my_trainings()')).length === 0, 'autre entreprise : rien');
check(await err('SELECT public.set_training_seen($1)', [t1.id]) === 'P0002', 'autre entreprise : ne coche pas');
await as(ANCIEN);
check((await rows('SELECT * FROM public.my_trainings()')).length === 0, 'salarié archivé : rien');
check((await errMsg('SELECT public.set_training_seen($1)', [t1.id]) || '').includes('Session invalide'), 'salarié archivé : « Session invalide »');
await as(ADMIN);
check((await rows('SELECT * FROM public.my_trainings()')).length === 0, 'le bureau : my_trainings ne rend rien (pas dans le public)');
check(await err('SELECT public.set_training_seen($1)', [t1.id]) === '42501', 'le bureau ne coche pas « Vue » (42501)');
await as('', 'anon');
check(await err('SELECT * FROM public.my_trainings()') === '42501', 'anon : my_trainings refusé');
check(await err('SELECT public.set_training_seen($1)', [t1.id]) === '42501', 'anon : set_training_seen refusé');
check(await err('SELECT * FROM public.trainings') === '42501', 'anon : table refusée');
check(await err('SELECT * FROM public.training_views') === '42501', 'anon : « Vue » refusées');

section('Bureau : qui l’a vue ; autre entreprise : rien');
await as(ADMIN2);
check((await rows('SELECT * FROM public.trainings')).length === 0, 'bureau d’une autre entreprise : aucune formation');
check((await rows(`UPDATE public.trainings SET archived_at = now() RETURNING id`)).length === 0, 'bureau d’une autre entreprise : ne retire rien');
check((await rows('SELECT * FROM public.training_views')).length === 0, 'bureau d’une autre entreprise : aucune « Vue »');
await as(ADMIN);
const views = await rows('SELECT training_id, user_id FROM public.training_views ORDER BY user_id');
check(views.length === 2 && views.some((v) => v.user_id === SAM && v.training_id === t1.id) && views.some((v) => v.user_id === CHEF && v.training_id === tAlex.id), 'bureau : voit qui a vu, dans son entreprise (Sam, le chef)');
const arch = await rows(`UPDATE public.trainings SET archived_at = '2020-01-01' WHERE id = $1 RETURNING id, archived_at`, [t1.id]);
check(arch.length === 1 && new Date(arch[0].archived_at).getFullYear() >= 2026, '« Retirer » : 1 ligne, date posée par le serveur (pas celle du navigateur)');
await as(SAM);
check(!(await rows('SELECT id FROM public.my_trainings()')).some((r) => r.id === t1.id), 'formation retirée : plus chez le salarié');
check(await err('SELECT public.set_training_seen($1)', [t1.id]) === 'P0002', 'formation retirée : ne se coche plus (P0002)');
await root();
check(await count('SELECT count(*) n FROM public.training_views WHERE training_id = $1', [t1.id]) === 1, '… ses « Vue » restent (preuve)');
await as(ADMIN);
check((await rows(`UPDATE public.trainings SET archived_at = NULL WHERE id = $1 RETURNING id`, [t1.id])).length === 1, '« Remettre » : 1 ligne');
await as(SAM);
check((await rows('SELECT id, seen_at FROM public.my_trainings()')).some((r) => r.id === t1.id && r.seen_at !== null), 'remise : de nouveau chez Sam, avec sa « Vue » d’avant');

section('Départs et suppressions : jamais bloqués');
await root();
await db.query(`UPDATE public.users SET is_active = false WHERE id = $1`, [ALEX]);
await as(ADMIN);
check(await err(`UPDATE public.trainings SET title = 'Harnais (MAJ)' WHERE id = $1`, [tAlex.id]) === null, 'titre modifié malgré un destinataire parti');
check(await err(`UPDATE public.trainings SET assignee_ids = array_append(assignee_ids, $2::uuid) WHERE id = $1`, [tAlex.id, AUTRE]) === '42501', 'ajouter un salarié d’une autre entreprise : refusé');
check(await err(`UPDATE public.trainings SET archived_at = now() WHERE id = $1`, [tAlex.id]) === null, 'retirer une formation dont un destinataire est parti : accepté');
await as(SAM);
check(await err('DELETE FROM public.documents WHERE id = $1', [DOC_SAM]) === null, 'Sam supprime son document (utilisé par une formation) : pas bloqué');
await root();
check((await one('SELECT document_id FROM public.trainings WHERE id = $1', [tDoc.id])).document_id === null, '… la formation garde sa ligne, document_id = NULL');
await as(SAM);
check(!(await rows('SELECT id FROM public.my_trainings()')).some((r) => r.id === tDoc.id), '… plus proposée au salarié');
await as(ADMIN);
check((await rows('SELECT id FROM public.trainings WHERE id = $1', [tDoc.id])).length === 1, '… le bureau la voit toujours (« document retiré »)');
await root();
check(await err(`DELETE FROM public.users WHERE id = $1`, [SAM]) === null, 'supprimer Sam (une « Vue ») : accepté');
check(await count('SELECT count(*) n FROM public.training_views WHERE user_id = $1', [SAM]) === 0, '… ses « Vue » partent avec lui (CASCADE)');
check(await err(`DELETE FROM public.users WHERE id = $1`, [ADMIN]) === null, 'supprimer l’auteur (bureau) : accepté');
check(await count(`SELECT count(*) n FROM public.trainings WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = created_by)`) === 0
  && await count(`SELECT count(*) n FROM public.trainings WHERE created_by IS NULL`) >= 3, '… created_by = NULL partout (aucune référence cassée)');

section('Jamais des heures');
check(await count('SELECT count(*) n FROM public.time_entries') === 0 && await count('SELECT count(*) n FROM public.active_sessions') === 0, 'aucune heure, aucun chrono écrit par les formations');

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
const gone = await one(`SELECT (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)) AS t,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($2)) AS f,
  (SELECT count(*) FROM pg_policies WHERE tablename = ANY($1)) AS p,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trainings_guard_write') AS g`, [NEW_TABLES, NEW_FNS]);
check(Number(gone.t) === 0 && Number(gone.f) === 0 && Number(gone.p) === 0 && Number(gone.g) === 0, 'tables, fonctions, policies et trigger du lot retirés');
const back = await prints();
check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.priv === before.priv,
  'après retour arrière : fonctions, policies, triggers, colonnes et droits existants identiques à avant la migration');
check(await count('SELECT count(*) n FROM public.documents') === 2, 'les documents ne bougent pas (seul celui que Sam a supprimé manque)');
check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
{
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification après application : de nouveau toute à true');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
