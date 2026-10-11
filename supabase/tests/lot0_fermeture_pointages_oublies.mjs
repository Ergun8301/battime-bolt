// Lot 0 — fermeture nocturne des pointages oubliés, rejouée POUR DE VRAI sur un
// Postgres jetable en mémoire (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:fermeture-nuit
//
// On reproduit l'état de la PRODUCTION : lots 9 et 11, puis le lot 12 SANS sa
// partie 6 (la base a reçu « lot12_pointage_qr_partie1 » seulement). On vérifie
// que close_forgotten_sessions manque, puis on charge le fichier du lot 0 TEL
// QUEL (deux fois), et on rejoue la sortie oubliée de bout en bout.
// Même bouchon que les tests des lots 11 et 12 (fonctions et policies de
// production recopiées mot pour mot), relu depuis lot11_cloture_salarie.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
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
const LUCAS = '10000000-0000-0000-0000-000000000001';
const NINA = '20000000-0000-0000-0000-000000000002';
const SAM = '40000000-0000-0000-0000-000000000004';
const OTHER = 'b0000000-0000-0000-0000-00000000000b';
const WS = 'e0000000-0000-0000-0000-000000000001';
const WS2 = 'e0000000-0000-0000-0000-000000000002';
const PLAN = 'd0000000-0000-0000-0000-000000000001';

const EXTRA = `
ALTER TABLE public.companies ADD COLUMN kiosk_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.time_entries ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
CREATE TABLE public.kiosks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, revoked_at timestamptz);
CREATE TABLE public.planning (id uuid PRIMARY KEY, user_id uuid, work_date date, estimated_end time);
GRANT SELECT ON public.planning TO authenticated;
GRANT ALL ON public.kiosks, public.planning TO service_role;
INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Paul', 'Martin'),
  ('${LUCAS}', '${CO}', 'worker', true, 'Lucas', 'Petit'),
  ('${NINA}', '${CO}', 'worker', true, 'Nina', 'Roux'),
  ('${SAM}', '${CO2}', 'worker', true, 'Sam', 'Sans'),
  ('${OTHER}', '${CO2}', 'admin', true, 'Autre', 'Patron');
INSERT INTO public.worksites VALUES ('${WS}', '${CO}'), ('${WS2}', '${CO2}');
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const db = new PGlite();
await db.exec(STUB);
await db.exec(EXTRA);

// ── État de la production : lot 12 sans sa partie 6 ─────────────────────────
const SQL12 = mig('20261003120000_lot12_pointage_qr.sql');
const CUT = SQL12.indexOf('-- ── 6) Fermeture des sorties oubliées');
check(CUT > 0, 'lot 12 : la partie 6 est repérée dans le fichier');
await db.exec(mig('20261001120000_lot9_fin_pointage.sql'));
await db.exec(mig('20261002120000_lot11_cloture_salarie.sql'));
await db.exec(SQL12.slice(0, CUT));
const hasFn = async () => (await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'close_forgotten_sessions'`)).rows[0].n;
check(await hasFn() === 0, 'avant le lot 0 : close_forgotten_sessions absente (comme en production)');

// ── Le fichier du lot 0 ──────────────────────────────────────────────────────
const SQL0 = mig('20261011090000_lot0_fermeture_pointages_oublies.sql');
const code = SQL0.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
check(!/\b(DROP|RENAME|TRUNCATE|ALTER\s+(TABLE|COLUMN|POLICY|FUNCTION))\b/i.test(code),
  'migration additive : aucun DROP, RENAME, TRUNCATE ni ALTER hors commentaires');
check((code.match(/\bDELETE\b/gi) || []).length === 1, 'un seul DELETE, hors commentaires …');
const body = code.slice(code.indexOf('AS $fn$'), code.indexOf('$fn$;'));
check(/DELETE FROM public\.active_sessions a\s+WHERE a\.user_id = s\.user_id AND a\.started_at = s\.started_at/.test(body),
  '… dans le corps de la fonction, sur la ligne « en cours » recopiée, jamais sur des heures');
check(body.indexOf('INSERT INTO public.time_entries') > 0 && body.indexOf('INSERT INTO public.time_entries') < body.indexOf('DELETE FROM'),
  '… et APRÈS l’écriture de la ligne d’heures');
const part6 = SQL12.slice(CUT);
const fnOf = (s) => s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.close_forgotten_sessions'), s.indexOf('$fn$;', s.indexOf('CREATE OR REPLACE FUNCTION public.close_forgotten_sessions')));
// La partie 6 du lot 12, plus EXACTEMENT les deux ajouts de la relecture
// (postes de nuit : 14 heures ; position de départ recopiée), rien d'autre.
const POS = SQL0.slice(SQL0.indexOf('    RETURNING id INTO v_id;'), SQL0.indexOf('    DELETE FROM public.active_sessions'));
const back0 = fnOf(SQL0)
  .replace('  v_id uuid;\n', '')
  .replace("WHERE a.work_date < v_today AND a.started_at < now() - interval '14 hours'\n       AND (p_user IS NULL OR a.user_id = p_user)",
    'WHERE a.work_date < v_today AND (p_user IS NULL OR a.user_id = p_user)')
  .replace(')\n' + POS, ');\n\n');
check(back0 === fnOf(part6), 'fonction = partie 6 du lot 12 (déjà testée) + les deux ajouts seulement');
check(/INSERT INTO public\.time_entry_positions[\s\S]*'start'/.test(POS) && /position_tracking_enabled/.test(POS),
  'ajout 2 : position de départ recopiée, seulement si l’entreprise l’enregistre');

const EXISTING_FN = ['get_my_company_id', 'is_admin', 'is_month_closed', 'guard_time_entry_write', 'guard_time_entry_delete',
  'guard_active_session', 'guard_month_closure', 'finish_active_session', 'user_closed_until', 'kiosk_open_session',
  'guard_active_session_qr', 'guard_time_entry_qr'];
const fnPrint = async () => (await db.query(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [EXISTING_FN])).rows[0].s;
const polPrint = async () => (await db.query(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies`)).rows[0].s;
const trgPrint = async () => (await db.query(`SELECT string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname) AS s
  FROM pg_trigger WHERE NOT tgisinternal`)).rows[0].s;
const colPrint = async () => (await db.query(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type, ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public'`)).rows[0].s;
const before = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint() };
await db.exec(SQL0);
const after = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint() };
check(before.fn === after.fn, 'fonctions existantes inchangées');
check(before.pol === after.pol, 'policies RLS inchangées');
check(before.trg === after.trg, 'triggers inchangés');
check(before.col === after.col, 'tables et colonnes inchangées');
check(await hasFn() === 1, 'close_forgotten_sessions créée');
const meta = (await db.query(`SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'close_forgotten_sessions'`)).rows[0];
check(meta.prosecdef === true && (meta.proconfig || []).some((c) => /^search_path=(""|)$/.test(c)), `SECURITY DEFINER avec search_path vide (${JSON.stringify(meta.proconfig)})`);
await db.exec(SQL0);
check(await hasFn() === 1, 'migration rejouable (idempotente)');

const { today, d: D, d2: D2 } = (await db.query(`SELECT ((now() AT TIME ZONE 'Europe/Paris')::date)::text AS today,
  ((now() AT TIME ZONE 'Europe/Paris')::date - 1)::text AS d, ((now() AT TIME ZONE 'Europe/Paris')::date - 3)::text AS d2`)).rows[0];

const as = async (uid) => {
  await db.exec(`RESET ROLE`);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  if (uid) await db.exec(`SET ROLE authenticated`);
};
const asService = async () => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); await db.exec(`SET ROLE service_role`); };
const asAnon = async () => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); await db.exec(`SET ROLE anon`); };
const run = async (sql, params = []) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } };
const refused = async (sql, params, needle, label) => {
  const r = await run(sql, params);
  const good = !r.ok && (needle instanceof RegExp ? needle.test(r.err) : r.err.includes(needle));
  check(good, `${label}${r.ok ? ' — ACCEPTÉ à tort' : good ? ` (« ${r.err} »)` : ` — refus inattendu : « ${r.err} »`}`);
};
const accepted = async (sql, params, label) => { const r = await run(sql, params); check(r.ok, `${label}${r.ok ? '' : ` — refusé : « ${r.err} »`}`); return r; };
const one = async (sql, params = []) => { await db.exec(`RESET ROLE`); return (await db.query(sql, params)).rows[0]; };
const START = `INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, $4::date)`;
const OPEN = `SELECT public.kiosk_open_session($1, $2, $3, $4::date)`;
// Vieillit un chrono : il devient celui d'un jour passé, commencé à HH:MM (Paris).
const backdate = (uid, day, hhmm) => one(`UPDATE public.active_sessions SET work_date = $2::date,
  started_at = (($2::date + $3::time) AT TIME ZONE 'Europe/Paris') WHERE user_id = $1 RETURNING 1`, [uid, day, hhmm]);
const CLOSE_ALL = `SELECT public.close_forgotten_sessions() AS n`;

// ═══ Droits ═════════════════════════════════════════════════════════════════
await as(LUCAS);
await refused(CLOSE_ALL, [], 'permission denied', 'salarié : interdit');
await as(ADMIN);
await refused(CLOSE_ALL, [], 'permission denied', 'bureau : interdit (seulement la nuit, ou la borne)');
await asAnon();
await refused(CLOSE_ALL, [], 'permission denied', 'anonyme : interdit');
await asService();
check((await run(CLOSE_ALL)).rows?.[0]?.n === 0, 'service (borne, cron) : autorisé ; rien à fermer = 0');

// ═══ Sans tablette (téléphone) : chrono d'hier, sans heure prévue ═══════════
await as(LUCAS);
await accepted(START, [LUCAS, CO, WS, today], 'Lucas démarre au téléphone …');
await backdate(LUCAS, D, '07:30');
await as(ADMIN);
await accepted(START, [ADMIN, CO, WS, today], 'le patron a un chrono ouvert AUJOURD’HUI');
await asService();
let n = (await run(CLOSE_ALL)).rows?.[0]?.n;
check(n === 1, `cron de nuit : 1 chrono oublié fermé (${n})`);
check(!!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [ADMIN])), '… celui d’aujourd’hui reste ouvert');
let r = await one(`SELECT source, exit_forgotten, status, to_char(start_time,'HH24:MI') AS s, to_char(end_time,'HH24:MI') AS e,
  work_date::text AS d, worksite_id, total_minutes, break_minutes, meal_allowance FROM public.time_entries WHERE user_id = $1`, [LUCAS]);
check(r && r.exit_forgotten === true && r.source === null && r.status === 'draft' && r.d === D && r.s === '07:30' && r.e === '07:30'
  && r.worksite_id === WS && r.total_minutes === 0 && r.break_minutes === 0 && r.meal_allowance === false,
  `brouillon « sortie oubliée » d’hier, début 07:30 gardé, fin à compléter, même chantier (${JSON.stringify(r)})`);
check(!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [LUCAS])), '… le chrono oublié n’est plus « en cours »');
await asService();
check((await run(CLOSE_ALL)).rows?.[0]?.n === 0, 'deuxième passage : rien de plus (pas de doublon)');
await as(LUCAS);
await refused(`UPDATE public.time_entries SET status = 'submitted' WHERE user_id = $1`, [LUCAS], 'indiquez l', '« à compléter » : impossible d’envoyer sans heure de fin');
await accepted(`UPDATE public.time_entries SET end_time = '16:00' WHERE user_id = $1`, [LUCAS], 'Lucas met sa sortie (16:00)');
r = await one(`SELECT total_minutes, exit_forgotten FROM public.time_entries WHERE user_id = $1`, [LUCAS]);
check(r.total_minutes === 510 && r.exit_forgotten === true, '… 8 h 30 comptées, badge « sortie oubliée » gardé');
await as(LUCAS);
await accepted(`UPDATE public.time_entries SET status = 'submitted' WHERE user_id = $1`, [LUCAS], '… puis il envoie');

// ═══ Avec tablette (QR) et heure prévue : fin = heure prévue ═══════════════
await one(`UPDATE public.companies SET kiosk_enabled = true WHERE id = $1`, [CO]);
await one(`INSERT INTO public.kiosks (company_id) VALUES ($1)`, [CO]);
await one(`INSERT INTO public.planning (id, user_id, work_date, estimated_end) VALUES ($1, $2, $3::date, '17:00')`, [PLAN, NINA, D]);
await asService();
await accepted(OPEN, [NINA, WS, PLAN, today], 'Nina scanne le QR (créneau prévu jusqu’à 17:00) …');
await backdate(NINA, D, '08:15');
await asService();
await run(`SELECT public.close_forgotten_sessions($1)`, [NINA]);
r = await one(`SELECT source, exit_forgotten, status, planning_id, to_char(start_time,'HH24:MI') AS s, to_char(end_time,'HH24:MI') AS e
  FROM public.time_entries WHERE user_id = $1`, [NINA]);
check(r && r.source === 'qr' && r.exit_forgotten && r.status === 'draft' && r.planning_id === PLAN && r.s === '08:15' && r.e === '17:00',
  `QR : fin = heure prévue (17:00), source qr et créneau gardés (${JSON.stringify(r)})`);
check(!!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [ADMIN])), 'appel ciblé (borne, le matin) : les autres chronos ne bougent pas');

// Heure prévue AVANT le début (commencé après la fin prévue) : fin = début.
await one(`UPDATE public.planning SET estimated_end = '07:00' WHERE id = $1`, [PLAN]);
await asService();
await accepted(OPEN, [NINA, WS, PLAN, today], 'Nina rescanne (prévu jusqu’à 07:00, commencé à 09:00)');
await backdate(NINA, D2, '09:00');
await asService();
await run(`SELECT public.close_forgotten_sessions($1)`, [NINA]);
r = await one(`SELECT to_char(end_time,'HH24:MI') AS e FROM public.time_entries WHERE user_id = $1 AND work_date = $2::date`, [NINA, D2]);
check(r && r.e === '09:00', 'heure prévue avant le début : fin = début (à compléter)');

// ═══ Jour clos : on n'écrit rien, on laisse ═════════════════════════════════
await asService();
await accepted(OPEN, [NINA, WS, null, today], 'Nina oublie encore');
await backdate(NINA, D, '06:00');
await one(`ALTER TABLE public.month_closures DISABLE TRIGGER USER`);
await one(`INSERT INTO public.month_closures (company_id, month) VALUES ($1, date_trunc('month', $2::date)::date) RETURNING 1`, [CO, D]);
await one(`ALTER TABLE public.month_closures ENABLE TRIGGER USER`);
const countNina = async () => (await one(`SELECT count(*)::int AS n FROM public.time_entries WHERE user_id = $1`, [NINA])).n;
let before2 = await countNina();
await asService();
check((await run(`SELECT public.close_forgotten_sessions($1) AS n`, [NINA])).rows?.[0]?.n === 0, 'mois clôturé : 0 fermé');
check(await countNina() === before2 && !!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [NINA])),
  '… aucune ligne écrite, le chrono reste (rien ne se perd)');
await one(`ALTER TABLE public.month_closures DISABLE TRIGGER USER`);
await one(`DELETE FROM public.month_closures WHERE company_id = $1 RETURNING 1`, [CO]);
await one(`ALTER TABLE public.month_closures ENABLE TRIGGER USER`);
await one(`ALTER TABLE public.user_closures DISABLE TRIGGER USER`);
await one(`INSERT INTO public.user_closures (user_id, company_id, closed_until, closed_by) VALUES ($1, $2, $3::date, $4) RETURNING 1`, [NINA, CO, D, ADMIN]);
await one(`ALTER TABLE public.user_closures ENABLE TRIGGER USER`);
await asService();
check((await run(`SELECT public.close_forgotten_sessions($1) AS n`, [NINA])).rows?.[0]?.n === 0, 'salarié clôturé jusqu’à ce jour : 0 fermé');
check(await countNina() === before2, '… aucune ligne écrite');
await one(`ALTER TABLE public.user_closures DISABLE TRIGGER USER`);
await one(`UPDATE public.user_closures SET reopened_at = now(), reopened_by = $2 WHERE user_id = $1 RETURNING 1`, [NINA, ADMIN]);
await one(`ALTER TABLE public.user_closures ENABLE TRIGGER USER`);
await asService();
check((await run(`SELECT public.close_forgotten_sessions($1) AS n`, [NINA])).rows?.[0]?.n === 1, 'rouvert : le chrono est fermé en brouillon');
check(await countNina() === before2 + 1, '… une ligne de plus');

// ═══ Autre entreprise : jamais mélangée ═════════════════════════════════════
await as(SAM);
await accepted(START, [SAM, CO2, WS2, today], 'Sam (autre entreprise) démarre');
await one(`UPDATE public.companies SET position_tracking_enabled = true WHERE id = $1`, [CO2]);
await one(`UPDATE public.active_sessions SET start_lat = 48.8566, start_lng = 2.3522, start_accuracy_m = 12 WHERE user_id = $1 RETURNING 1`, [SAM]);
await backdate(SAM, D, '09:00');
await asService();
check((await run(CLOSE_ALL)).rows?.[0]?.n === 1, 'cron : le chrono oublié de l’autre entreprise est fermé aussi');
r = await one(`SELECT company_id, worksite_id FROM public.time_entries WHERE user_id = $1`, [SAM]);
check(r && r.company_id === CO2 && r.worksite_id === WS2, '… dans SA propre entreprise, sur SON chantier');
r = await one(`SELECT p.moment, p.latitude::float AS lat, p.longitude::float AS lng, p.accuracy_m, p.company_id
  FROM public.time_entry_positions p JOIN public.time_entries e ON e.id = p.entry_id WHERE e.user_id = $1`, [SAM]);
check(r && r.moment === 'start' && r.lat === 48.8566 && r.lng === 2.3522 && r.accuracy_m === 12 && r.company_id === CO2,
  `position de départ recopiée sur la ligne d’heures (entreprise qui l’enregistre) (${JSON.stringify(r)})`);
check((await one(`SELECT count(*)::int AS n FROM public.time_entry_positions p JOIN public.time_entries e ON e.id = p.entry_id WHERE e.company_id = $1`, [CO])).n === 0,
  '… aucune position pour l’entreprise qui ne l’enregistre pas');

// ═══ Poste de nuit : un chrono commencé il y a moins de 14 h reste ouvert ═══
await one(`UPDATE public.companies SET kiosk_enabled = false WHERE id = $1`, [CO2]);
await as(SAM);
await accepted(START, [SAM, CO2, WS2, today], 'Sam reprend un poste de nuit …');
await one(`UPDATE public.active_sessions SET work_date = $2::date, started_at = now() - interval '4 hours' WHERE user_id = $1 RETURNING 1`, [SAM, D]);
await asService();
check((await run(CLOSE_ALL)).rows?.[0]?.n === 0, 'cron de nuit : un chrono d’hier commencé il y a 4 h n’est PAS fermé');
await asService();
check((await run(`SELECT public.close_forgotten_sessions($1) AS n`, [SAM])).rows?.[0]?.n === 0, '… ni par la borne (la sortie de 05:00 reste une sortie)');
check(!!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [SAM])), '… le chrono reste ouvert');
await one(`UPDATE public.active_sessions SET started_at = now() - interval '15 hours' WHERE user_id = $1 RETURNING 1`, [SAM]);
await asService();
check((await run(CLOSE_ALL)).rows?.[0]?.n === 1, 'commencé il y a 15 h : fermé en brouillon « sortie oubliée »');

// ═══ Cron : planifié sous un nom stable, re-planifier remplace ═════════════
// PGlite n'a pas pg_cron : on rejoue le bloc DO du fichier contre un faux
// schéma cron (mêmes signatures), condition d'extension forcée à vrai.
await one(`CREATE SCHEMA cron`);
await one(`CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text UNIQUE, schedule text, command text)`);
await one(`CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS
  $$ INSERT INTO cron.job (jobname, schedule, command) VALUES (n, s, c) RETURNING jobid::bigint $$`);
await one(`CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS
  $$ DELETE FROM cron.job WHERE jobname = n RETURNING true $$`);
const DO = SQL0.slice(SQL0.lastIndexOf('DO $$')).replace(`EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')`, 'true');
check(DO.includes(`cron.schedule('bemexo-close-forgotten-sessions', '30 0 * * *'`), 'bloc cron repéré (00:30 UTC chaque nuit)');
await db.exec(DO);
await db.exec(DO);
r = (await db.query(`SELECT jobname, schedule, command FROM cron.job`)).rows;
check(r.length === 1 && r[0].jobname === 'bemexo-close-forgotten-sessions' && r[0].schedule === '30 0 * * *'
  && /SELECT public\.close_forgotten_sessions\(\);/.test(r[0].command), `un seul travail cron après deux passages (${JSON.stringify(r)})`);

// ═══ Vérification d'en-tête et retour arrière ═══════════════════════════════
const header = SQL0.slice(0, SQL0.indexOf('-- HISTORIQUE'));
const verif = header.slice(header.indexOf('--   SELECT', header.indexOf('VÉRIFICATION'))).split('\n').map((l) => l.replace(/^--\s?/, '')).join('\n').trim();
r = (await run(verif)).rows?.[0];
check(r && r.fonction === true && r.droits === true && r.cron === true && r.appel_vide === true, `vérification d’en-tête : 4 × true (${JSON.stringify(r)})`);
const back = header.slice(header.indexOf('RETOUR ARRIÈRE'), header.indexOf('-- VÉRIFICATION')).split('\n')
  .filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n');
// L'historique, tel qu'en production après inscription (même table, mêmes colonnes utiles).
await one(`CREATE SCHEMA supabase_migrations`);
await one(`CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[])`);
const hist = SQL0.slice(SQL0.indexOf('-- HISTORIQUE'), SQL0.indexOf('-- ─', SQL0.indexOf('-- HISTORIQUE'))).split('\n')
  .filter((l) => /^--\s{3}/.test(l)).map((l) => l.replace(/^--\s{3}/, '')).join('\n');
await db.exec(hist);
await db.exec(hist);
check((await one(`SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations WHERE name = 'lot0_fermeture_pointages_oublies' AND version = '20261011090000'`)).n === 1,
  'inscription d’en-tête : une ligne, sous le nom du fichier (rejouable)');
await db.exec(back);
check(await hasFn() === 0 && (await db.query(`SELECT count(*)::int AS n FROM cron.job`)).rows[0].n === 0, 'retour arrière : fonction et cron retirés');
check((await one(`SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations`)).n === 0, '… et l’inscription dans l’historique aussi');
check((await one(`SELECT count(*)::int AS n FROM public.time_entries`)).n > 0, '… les lignes d’heures déjà écrites restent');
await db.exec(SQL0);
check(await hasFn() === 1, 'rechargée après le retour arrière');

console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
