// Lot 5 — journal des relances (statistiques du bureau). Rejoué POUR DE VRAI sur
// un Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:stats-db
//
// Même bouchon que les lots 2, 4, 11, 12 et 14 (fonctions de PRODUCTION
// recopiées mot pour mot), plus reminder_log créée à la main (sa migration
// 20260726160000 planifie un cron que PGlite n'a pas) et les droits PAR DÉFAUT
// de production (tout pour anon / authenticated sur les objets neufs) — pour
// prouver que la migration les reprend. La migration est chargée TELLE QUELLE,
// deux fois ; puis son RETOUR ARRIÈRE (décommenté) est exécuté, et elle est
// rechargée.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(here, '..', 'migrations', '20261010190000_lot5_journal_relances.sql'), 'utf8');
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
const AUTRE = '70000000-0000-0000-0000-000000000007'; // salarié de l'autre entreprise

const EXTRA = `
-- reminder_log telle que la crée 20260726160000 (sans le cron).
CREATE TABLE public.reminder_log (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  sent_count integer NOT NULL DEFAULT 1,
  channel text
);
CREATE INDEX reminder_log_company_idx ON public.reminder_log(company_id);
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.reminder_log TO service_role;
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${EXADMIN}', '${CO}', 'admin', false, 'Ex', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'),
  ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Test'),
  ('${AUTRE}', '${CO2}', 'worker', true, 'Autre', 'Salarié');
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

/** Les lignes SQL commentées du fichier entre deux repères (comme le test du lot 4). */
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
const NEW_TABLES = ['hours_reminders'];
const NEW_FNS = ['log_hours_reminder', 'log_auto_hours_reminder'];
const NEW_TRG = 'reminder_log_journal';

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
section('Migration : additive, rejouable, droits repris malgré les droits par défaut');
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND NOT (proname = ANY($1))`, [NEW_FNS])).s;
const polPrint = async () => (await one(`SELECT coalesce(string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname), '') AS s
  FROM pg_policies WHERE NOT (tablename = ANY($1))`, [NEW_TABLES])).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s FROM pg_trigger WHERE NOT tgisinternal AND tgname <> $1`, [NEW_TRG])).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND NOT (table_name = ANY($1))`, [NEW_TABLES])).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT (c.relname = ANY($1)) ORDER BY 1, 2`, [NEW_TABLES]));
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), priv: await privPrint() });
const before = await prints();
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (get_my_company_id, is_admin, gardes des heures…)');
check(before.pol === after.pol, 'policies existantes inchangées');
check(before.trg === after.trg, 'triggers existants inchangés (seul reminder_log_journal est ajouté)');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée sur les tables existantes (reminder_log comprise)');
check(before.priv === after.priv, 'droits des tables existantes inchangés');
check(!/\b(DROP\s+(TABLE|COLUMN|FUNCTION|POLICY\s+IF\s+EXISTS\s+(?!hours_reminders_admin_select\b))|DROP\s+TRIGGER\s+IF\s+EXISTS\s+(?!reminder_log_journal\b)|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|DELETE\s+FROM|UPDATE\s+public\.)/i.test(SQL.split('-- RETOUR ARRIÈRE')[0]),
  'migration additive : aucun DROP / RENAME / ALTER / DELETE / UPDATE d’objet existant (hors retour arrière)');
check(!!POST_SQL && !!ROLLBACK_SQL, 'le fichier contient la vérification après application et le retour arrière (blocs commentés)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 8 && bad.length === 0, `vérification après application : 8 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}
{
  const r = await rows(`SELECT p, role FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p, unnest(ARRAY['authenticated','anon']) role
    WHERE has_table_privilege(role, 'public.hours_reminders', p)`);
  check(r.map((x) => `${x.role}:${x.p}`).join(' ') === 'authenticated:SELECT', `hours_reminders : authenticated SELECT seulement, anon rien (${r.map((x) => `${x.role}:${x.p}`).join(' ') || 'aucun'})`);
  const fns = await one(`SELECT bool_and(prosecdef) AS d, bool_and(array_to_string(proconfig, ',') = 'search_path=""') AS s,
    bool_or(has_function_privilege('anon', oid, 'EXECUTE')) AS a FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [NEW_FNS]);
  check(fns.d && fns.s && !fns.a, 'fonctions : SECURITY DEFINER, search_path vide, anon exclu');
  check(await one(`SELECT has_function_privilege('authenticated', 'public.log_auto_hours_reminder()', 'EXECUTE') AS x`).then((x) => x.x === false), 'la fonction du trigger n’est pas appelable par authenticated');
}

// ═══ Le bouton « Relancer » ═══════════════════════════════════════════════
section('log_hours_reminder : le bureau note SES relances, et rien d’autre');
await as(ADMIN);
const id1 = (await one(`SELECT public.log_hours_reminder($1, $2::date[], 'push') AS id`, [SAM, '{2026-10-19,2026-10-20}'])).id;
check(!!id1, 'bureau A : relance de Sam notée (canal push, 2 jours)');
const r1 = await one(`SELECT * FROM public.hours_reminders WHERE id = $1`, [id1]);
check(r1.company_id === CO && r1.user_id === SAM && r1.source === 'bureau' && r1.channel === 'push' && r1.sent_by === ADMIN
  && JSON.stringify(r1.days.map((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d)))) === JSON.stringify(['2026-10-19', '2026-10-20']),
  'ligne : entreprise du bureau, source bureau, sent_by = le bureau, jours conservés');
check(!(await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'mailto')`, [CHEF])), 'bureau A : relance du chef d’équipe (e-mail préparé)');
check(!(await err(`SELECT public.log_hours_reminder($1)`, [ALEX])), 'bureau A : sans jours ni canal (Assistant) → accepté');
check((await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'push')`, [AUTRE])) === 'P0002', 'refus : salarié d’une autre entreprise (P0002)');
check((await err(`SELECT public.log_hours_reminder(NULL, '{}'::date[], 'push')`)) === 'P0002', 'refus : salarié absent (P0002)');
check((await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'sms')`, [SAM])) === '22023', 'refus : canal inconnu (22023)');
check((await err(`SELECT public.log_hours_reminder($1, ARRAY(SELECT '2026-01-01'::date + g FROM generate_series(1, 63) g), 'push')`, [SAM])) === '22023', 'refus : plus de 62 jours (22023)');
check((await err(`SELECT public.log_hours_reminder($1, ARRAY(SELECT '2026-01-01'::date + g FROM generate_series(1, 62) g), 'push')`, [SAM])) === null, '62 jours (deux mois) : accepté');
await as(SAM);
check((await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'push')`, [ALEX])) === '42501', 'salarié : refus (42501)');
await as(CHEF);
check((await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'push')`, [SAM])) === '42501', 'chef d’équipe : refus (42501)');
await as(EXADMIN);
check((await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'push')`, [SAM])) === '42501', 'bureau archivé : refus (42501)');
await as(ADMIN2);
check((await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'push')`, [SAM])) === 'P0002', 'bureau B : ne note rien pour un salarié de A (P0002)');
await as('', 'anon');
check((await err(`SELECT public.log_hours_reminder($1, '{}'::date[], 'push')`, [SAM])) === '42501', 'anon : fonction refusée (42501)');

// ═══ La relance automatique ═══════════════════════════════════════════════
section('Trigger sur reminder_log : la relance automatique est notée, jamais bloquée');
await as('', 'service_role');
const autoCount = async () => { await root(); const n = await count(`SELECT count(*) n FROM public.hours_reminders WHERE source = 'auto'`); await as('', 'service_role'); return n; };
check(!(await err(`INSERT INTO public.reminder_log (user_id, company_id, last_sent_at, sent_count, channel) VALUES ($1, $2, '2026-10-19T15:00:00Z', 1, 'email')`, [SAM, CO])), 'cron (service_role) : 1re relance de Sam inscrite dans reminder_log');
check(await autoCount() === 1, '… une ligne « auto » au journal');
await root();
{
  const a = await one(`SELECT * FROM public.hours_reminders WHERE source = 'auto'`);
  check(a.company_id === CO && a.user_id === SAM && a.channel === 'email' && new Date(a.sent_at).toISOString() === '2026-10-19T15:00:00.000Z' && a.sent_by === null,
    '… entreprise, salarié, canal email, date de la relance, sans auteur');
}
await as('', 'service_role');
const upsert = (ts, n, ch = 'push') => err(`INSERT INTO public.reminder_log (user_id, company_id, last_sent_at, sent_count, channel) VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (user_id) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at, sent_count = EXCLUDED.sent_count, channel = EXCLUDED.channel`, [SAM, CO, ts, n, ch]);
check(!(await upsert('2026-10-19T15:00:00Z', 1, 'email')) && await autoCount() === 1, 'upsert sans nouvelle date : pas une relance (toujours 1)');
check(!(await upsert('2026-10-21T15:00:00Z', 2, 'push')) && await autoCount() === 2, 'upsert avec une nouvelle date (comme la fonction edge) : +1');
check(!(await upsert('2026-10-23T15:00:00Z', 3, 'sms')) && await autoCount() === 3, 'canal hors liste : +1 …');
await root();
check((await one(`SELECT channel FROM public.hours_reminders WHERE source = 'auto' ORDER BY sent_at DESC LIMIT 1`)).channel === null, '… noté sans canal (NULL)');
await as('', 'service_role');
check(!(await err(`DELETE FROM public.reminder_log WHERE user_id = $1`, [SAM])) && await autoCount() === 3, 'remise à zéro (DELETE reminder_log) : le journal garde ses lignes');
await root();
await db.exec(`ALTER TABLE public.hours_reminders ADD CONSTRAINT test_panne CHECK (false) NOT VALID`);
await as('', 'service_role');
check(!(await err(`INSERT INTO public.reminder_log (user_id, company_id, channel) VALUES ($1, $2, 'push')`, [ALEX, CO])), 'journal en panne : la relance automatique passe QUAND MÊME (erreur avalée)');
await root();
check(await count(`SELECT count(*) n FROM public.reminder_log WHERE user_id = $1`, [ALEX]) === 1, '… reminder_log bien écrit');
await db.exec(`ALTER TABLE public.hours_reminders DROP CONSTRAINT test_panne`);
check(!(await err(`INSERT INTO public.reminder_log (user_id, company_id, channel) VALUES ($1, $2, 'email')`, [AUTRE, CO2])), 'relance automatique dans l’autre entreprise');

// ═══ Qui lit le journal ═══════════════════════════════════════════════════
section('Lecture : le bureau de l’entreprise, et lui seul');
await root();
const allA = await count(`SELECT count(*) n FROM public.hours_reminders WHERE company_id = $1`, [CO]);
const allB = await count(`SELECT count(*) n FROM public.hours_reminders WHERE company_id = $1`, [CO2]);
await as(ADMIN);
check(await count(`SELECT count(*) n FROM public.hours_reminders`) === allA && allA >= 6, `bureau A : lit les ${allA} relances de SON entreprise`);
check(await count(`SELECT count(*) n FROM public.hours_reminders WHERE company_id = $1`, [CO2]) === 0, 'bureau A : 0 relance de B');
await as(ADMIN2);
check(await count(`SELECT count(*) n FROM public.hours_reminders`) === allB && allB === 1, 'bureau B : sa seule relance');
check(await count(`SELECT count(*) n FROM public.hours_reminders WHERE company_id = $1`, [CO]) === 0, 'bureau B : 0 relance de A');
await as(SAM);
check(await count(`SELECT count(*) n FROM public.hours_reminders`) === 0, 'salarié : 0 ligne, pas même les siennes (bureau seulement)');
await as(CHEF);
check(await count(`SELECT count(*) n FROM public.hours_reminders`) === 0, 'chef d’équipe : 0 ligne');
await as(EXADMIN);
check(await count(`SELECT count(*) n FROM public.hours_reminders`) === 0, 'bureau archivé : 0 ligne');
await as('', 'anon');
check((await err(`SELECT * FROM public.hours_reminders`)) === '42501', 'anon : lecture refusée (42501)');
check((await err(`INSERT INTO public.hours_reminders (company_id, user_id, source) VALUES ($1, $2, 'bureau')`, [CO, SAM])) === '42501', 'anon : écriture refusée');

section('Aucune écriture directe : seules les deux fonctions écrivent');
await as(ADMIN);
check((await err(`INSERT INTO public.hours_reminders (company_id, user_id, source) VALUES ($1, $2, 'bureau')`, [CO, SAM])) === '42501', 'bureau : INSERT direct refusé');
check((await err(`UPDATE public.hours_reminders SET channel = 'push'`)) === '42501', 'bureau : UPDATE refusé');
check((await err(`DELETE FROM public.hours_reminders`)) === '42501', 'bureau : DELETE refusé (compteur non effaçable depuis l’app)');
check((await err(`SELECT public.log_auto_hours_reminder()`)) === '42501', 'bureau : la fonction du trigger n’est pas appelable');
await as(SAM);
check((await err(`INSERT INTO public.hours_reminders (company_id, user_id, source) VALUES ($1, $2, 'bureau')`, [CO, SAM])) === '42501', 'salarié : INSERT refusé');
check((await err(`INSERT INTO public.reminder_log (user_id, company_id) VALUES ($1, $2)`, [SAM, CO])) === '42501', 'salarié : reminder_log reste fermée (aucun droit, comme avant)');

section('Rejouer la migration ne perd rien');
await root();
const nBefore = await count(`SELECT count(*) n FROM public.hours_reminders`);
check(!(await errExec(SQL)) && await count(`SELECT count(*) n FROM public.hours_reminders`) === nBefore, `migration rechargée : les ${nBefore} relances notées restent`);
check(await count(`SELECT count(*) n FROM pg_trigger WHERE tgname = $1`, [NEW_TRG]) === 1, 'un seul trigger (pas de doublon)');
await as('', 'service_role');
const nAuto = await autoCount();
check(!(await upsert('2026-10-26T15:00:00Z', 1, 'push')) && await autoCount() === nAuto + 1, 'après rechargement : une relance = une ligne (pas deux)');

section('Supprimer un salarié, un bureau');
await root();
check(!(await err(`DELETE FROM public.users WHERE id = $1`, [ADMIN])), 'supprimer l’auteur (bureau) : accepté …');
check(await count(`SELECT count(*) n FROM public.hours_reminders WHERE source = 'bureau' AND sent_by IS NULL`) >= 3, '… ses relances restent, sent_by = NULL');
check(!(await err(`DELETE FROM public.users WHERE id = $1`, [SAM])), 'supprimer Sam : accepté …');
check(await count(`SELECT count(*) n FROM public.hours_reminders WHERE user_id = $1`, [SAM]) === 0, '… ses relances partent avec lui (CASCADE)');

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
const gone = await one(`SELECT (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)) AS t,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($2)) AS f,
  (SELECT count(*) FROM pg_trigger WHERE tgname = $3) AS g`, [NEW_TABLES, NEW_FNS, NEW_TRG]);
check(Number(gone.t) === 0 && Number(gone.f) === 0 && Number(gone.g) === 0, 'table, fonctions et trigger du lot retirés');
const back = await prints();
check(back.fn === before.fn && back.pol === before.pol && back.trg === before.trg && back.col === before.col && back.priv === before.priv,
  'après retour arrière : fonctions, policies, triggers, colonnes et droits existants identiques à avant la migration');
await as('', 'service_role');
check(!(await err(`INSERT INTO public.reminder_log (user_id, company_id, channel) VALUES ($1, $2, 'push')`, [CHEF, CO])), 'après retour arrière : la relance automatique s’écrit comme avant');
await root();
check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
{
  const v = await one(POST_SQL);
  check(Object.values(v).every((x) => x === true), 'vérification après application : de nouveau toute à true');
}

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
