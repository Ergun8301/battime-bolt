// Lot 12 — pointage QR (entrée / sortie, sortie oubliée, trace) rejoué POUR DE
// VRAI sur un Postgres jetable en mémoire (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:pointage-qr
//
// Même bouchon que le test du lot 11 (fonctions et policies de PRODUCTION
// recopiées mot pour mot), relu depuis supabase/tests/lot11_cloture_salarie.mjs,
// plus les tables `kiosks` et `planning` réduites. Les migrations des lots 9,
// 11 et 12 sont chargées TELLES QUELLES.
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

const EXISTING_FN = ['get_my_company_id', 'is_admin', 'is_month_closed', 'guard_time_entry_write', 'guard_time_entry_delete',
  'guard_active_session', 'guard_month_closure', 'mark_reserve_fixed', 'finish_active_session', 'user_closed_until'];
const fnPrint = async () => (await db.query(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [EXISTING_FN])).rows[0].s;
const polPrint = async () => (await db.query(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies`)).rows[0].s;
const trgPrint = async () => (await db.query(`SELECT string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname) AS s
  FROM pg_trigger WHERE NOT tgisinternal AND tgname NOT IN ('active_sessions_qr_guard', 'time_entries_qr_guard')`)).rows[0].s;

await db.exec(mig('20261001120000_lot9_fin_pointage.sql'));
await db.exec(mig('20261002120000_lot11_cloture_salarie.sql'));
const before = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint() };
const SQL12 = mig('20261003120000_lot12_pointage_qr.sql');
await db.exec(SQL12);
check(/^(?![\s\S]*\b(DROP\s+(TABLE|COLUMN|FUNCTION|POLICY)|RENAME|ALTER\s+COLUMN|DELETE\s+FROM\s+public\.time_entries|ALTER\s+POLICY))/i.test(SQL12),
  'migration additive : aucun DROP TABLE/COLUMN/FUNCTION/POLICY, RENAME, ALTER COLUMN, ni effacement de lignes d’heures');
const after = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint() };
check(before.fn === after.fn, 'fonctions existantes inchangées (dont finish_active_session, user_closed_until)');
check(before.pol === after.pol, 'policies RLS inchangées');
check(before.trg === after.trg, 'triggers existants inchangés');
await db.exec(SQL12);
check(true, 'migration rejouable (idempotente)');

const { today, d: D } = (await db.query(`SELECT ((now() AT TIME ZONE 'Europe/Paris')::date)::text AS today,
  ((now() AT TIME ZONE 'Europe/Paris')::date - 1)::text AS d`)).rows[0];

const as = async (uid) => {
  await db.exec(`RESET ROLE`);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  if (uid) await db.exec(`SET ROLE authenticated`);
};
const asService = async () => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); await db.exec(`SET ROLE service_role`); };
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
const FINISH = `SELECT * FROM public.finish_active_session()`;
const age = (uid, interval) => one(`UPDATE public.active_sessions SET started_at = now() - $2::interval WHERE user_id = $1 RETURNING 1`, [uid, interval]);

// ═══ Sans tablette : rien ne change côté base ═════════════════════════════
await as(LUCAS);
check((await run(`SELECT public.company_has_kiosk() AS v`)).rows?.[0]?.v === false, 'sans tablette : company_has_kiosk() = non');
await accepted(START, [LUCAS, CO, WS, today], 'sans tablette : le chrono du téléphone démarre (aucun blocage en base)');
check((await one(`SELECT source FROM public.active_sessions WHERE user_id = $1`, [LUCAS])).source === null, '… et il n’est pas marqué QR');
await age(LUCAS, '3 hours');
await as(LUCAS);
await accepted(FINISH, [], '… « J’ai fini » le ferme');
const manual = await one(`SELECT id, source, exit_forgotten FROM public.time_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [LUCAS]);
check(manual.source === null && manual.exit_forgotten === false, 'ligne du téléphone : ni QR, ni sortie oubliée');
await one(`DELETE FROM public.time_entries WHERE id = $1`, [manual.id]);

// ═══ Avec tablette : on commence par le QR ════════════════════════════════
await one(`UPDATE public.companies SET kiosk_enabled = true WHERE id = $1`, [CO]);
await one(`INSERT INTO public.kiosks (company_id) VALUES ($1)`, [CO]);
await as(LUCAS);
check((await run(`SELECT public.company_has_kiosk() AS v`)).rows?.[0]?.v === true, 'avec tablette : company_has_kiosk() = oui');
await as(SAM);
check((await run(`SELECT public.company_has_kiosk() AS v`)).rows?.[0]?.v === false, 'autre entreprise sans tablette : non');
await as(LUCAS);
await refused(START, [LUCAS, CO, WS, today], 'scannant le QR', 'avec tablette : le téléphone ne peut PAS commencer');
await as(ADMIN);
await refused(START, [ADMIN, CO, WS, today], 'scannant le QR', '… le bureau non plus (même règle pour tous)');
await as(LUCAS);
await refused(OPEN, [LUCAS, WS, null, today], 'permission denied', 'kiosk_open_session : interdit au salarié (service seulement)');
await refused(`SELECT public.close_forgotten_sessions()`, [], 'permission denied', 'close_forgotten_sessions : interdit au salarié');
await refused(`SELECT public.company_kiosk_active($1)`, [CO], 'permission denied', 'company_kiosk_active : interdit au salarié');
await asService();
await accepted(OPEN, [LUCAS, WS, null, today], 'arrivée par la tablette : le chrono démarre');
check((await one(`SELECT source FROM public.active_sessions WHERE user_id = $1`, [LUCAS])).source === 'qr', '… marqué QR');
await as(LUCAS);
await run(`UPDATE public.active_sessions SET source = NULL WHERE user_id = $1`, [LUCAS]);
check((await one(`SELECT source FROM public.active_sessions WHERE user_id = $1`, [LUCAS])).source === 'qr', '… le chrono reste QR');
await asService();
await refused(OPEN, [LUCAS, WS, null, today], 'duplicate key', 'deuxième arrivée le même jour : refusée (un seul chrono)');

// Clôture du salarié : la tablette passe par les gardes existants.
await one(`INSERT INTO public.user_closures (user_id, company_id, closed_until, closed_by) VALUES ($1, $2, $3::date, $4)`, [NINA, CO, today, ADMIN]);
await asService();
await refused(OPEN, [NINA, WS, null, today], /cl[ôo]tur/, 'salarié clôturé : la tablette refuse l’arrivée (garde du lot 11 appliqué)');
await one(`UPDATE public.user_closures SET reopened_at = now() WHERE user_id = $1`, [NINA]);

// ═══ Sortie : par le QR (finish_active_session au nom du salarié) ═════════
await age(LUCAS, '9 hours');
const startMin = (await one(`SELECT to_char(date_trunc('minute', started_at AT TIME ZONE 'Europe/Paris'), 'HH24:MI') AS s FROM public.active_sessions WHERE user_id = $1`, [LUCAS])).s;
await as(LUCAS);
await accepted(FINISH, [], 'sortie (2e scan ou « Terminer ma journée ») : la ligne est écrite');
const qr = await one(`SELECT id, source, exit_forgotten, corrected_at, to_char(start_time, 'HH24:MI') AS s, status FROM public.time_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [LUCAS]);
check(qr.source === 'qr' && qr.exit_forgotten === false && qr.corrected_at === null && qr.s === startMin && qr.status === 'draft',
  `ligne QR : source = qr, brouillon, début ${qr.s} = minute du scan`);
check(!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [LUCAS])), '… et le chrono est fermé');

// Personne ne pose ni n'efface la trace à la main.
await as(LUCAS);
await accepted(`UPDATE public.time_entries SET source = NULL, exit_forgotten = true, corrected_at = now() WHERE id = $1`, [qr.id], 'le salarié tente d’effacer la trace');
let r = await one(`SELECT source, exit_forgotten, corrected_at FROM public.time_entries WHERE id = $1`, [qr.id]);
check(r.source === 'qr' && r.exit_forgotten === false && r.corrected_at === null, '… sans effet (trace intacte)');
await accepted(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status, source, exit_forgotten)
  VALUES ($1, $2, $3, $4::date, '06:00', '07:00', 'draft', 'qr', true)`, [CO, LUCAS, WS, today], 'le salarié insère une ligne « QR » à la main');
r = await one(`SELECT source, exit_forgotten FROM public.time_entries WHERE user_id = $1 AND start_time = '06:00'`, [LUCAS]);
check(r.source === null && r.exit_forgotten === false, '… elle n’est NI QR NI sortie oubliée');

// Correction d'une ligne QR : visible pour le bureau.
await as(LUCAS);
await accepted(`UPDATE public.time_entries SET break_minutes = 30 WHERE id = $1`, [qr.id], 'pause ajoutée sur la ligne QR');
check((await one(`SELECT corrected_at FROM public.time_entries WHERE id = $1`, [qr.id])).corrected_at === null, '… une pause n’est pas une correction des heures');
await accepted(`UPDATE public.time_entries SET end_time = end_time - interval '1 hour' WHERE id = $1`, [qr.id], 'le salarié change son heure de fin');
check((await one(`SELECT corrected_at FROM public.time_entries WHERE id = $1`, [qr.id])).corrected_at !== null, '… badge « corrigé » pour le bureau');
const man2 = await one(`SELECT id FROM public.time_entries WHERE user_id = $1 AND start_time = '06:00'`, [LUCAS]);
await as(LUCAS);
await accepted(`UPDATE public.time_entries SET end_time = '07:30' WHERE id = $1`, [man2.id], 'ligne saisie à la main modifiée');
check((await one(`SELECT corrected_at FROM public.time_entries WHERE id = $1`, [man2.id])).corrected_at === null, '… pas de badge « corrigé » (pas une ligne QR)');

// ═══ Sortie oubliée, fermée la nuit ═══════════════════════════════════════
// Hier 08:00 (Paris), sans heure prévue.
await asService();
await accepted(OPEN, [NINA, WS, null, today], 'Nina scanne à l’arrivée');
await one(`UPDATE public.active_sessions SET work_date = $2::date, started_at = (($2::date + time '08:00') AT TIME ZONE 'Europe/Paris') WHERE user_id = $1`, [NINA, D]);
// Aujourd'hui : un chrono ouvert ce matin n'est PAS touché.
await asService();
await accepted(OPEN, [ADMIN, WS, null, today], 'un chrono d’aujourd’hui (le patron) …');
await asService();
const n = (await run(`SELECT public.close_forgotten_sessions() AS n`)).rows?.[0]?.n;
check(n === 1, `cron de nuit : 1 chrono oublié fermé (${n})`);
check(!!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [ADMIN])), '… celui d’aujourd’hui reste ouvert');
const lost = await one(`SELECT id, source, exit_forgotten, status, to_char(start_time,'HH24:MI') AS s, to_char(end_time,'HH24:MI') AS e, work_date::text AS d, total_minutes FROM public.time_entries WHERE user_id = $1`, [NINA]);
check(lost && lost.exit_forgotten === true && lost.source === 'qr' && lost.status === 'draft' && lost.d === D && lost.s === '08:00' && lost.e === '08:00' && lost.total_minutes === 0,
  `ligne « sortie oubliée » : hier, brouillon, 08:00 → fin à compléter (${JSON.stringify(lost)})`);
check(!(await one(`SELECT 1 AS x FROM public.active_sessions WHERE user_id = $1`, [NINA])), '… le chrono oublié est fermé (la borne ne bloque plus le lendemain)');
await as(NINA);
await refused(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [lost.id], 'indiquez l', '« à compléter » : impossible d’envoyer sans heure de fin');
await as(ADMIN);
await refused(`UPDATE public.time_entries SET status = 'validated' WHERE id = $1`, [lost.id], 'indiquez l', '… ni de la valider côté bureau');
await as(NINA);
await accepted(`UPDATE public.time_entries SET end_time = '16:45' WHERE id = $1`, [lost.id], 'Nina met son heure de sortie (16:45)');
r = await one(`SELECT exit_forgotten, corrected_at, total_minutes FROM public.time_entries WHERE id = $1`, [lost.id]);
check(r.exit_forgotten === true && r.corrected_at === null && r.total_minutes === 525, '… badge « sortie oubliée » gardé, pas « corrigé », 8 h 45 comptées');
await as(NINA);
await accepted(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [lost.id], '… puis elle envoie');

// Avec heure prévue : fin = heure prévue (envoyable, badge gardé).
await one(`INSERT INTO public.planning (id, user_id, work_date, estimated_end) VALUES ($1, $2, $3::date, '17:00')`, [PLAN, NINA, D]);
await asService();
await accepted(OPEN, [NINA, WS, PLAN, today], 'Nina oublie encore (créneau prévu jusqu’à 17:00)');
await one(`UPDATE public.active_sessions SET work_date = $2::date, started_at = (($2::date + time '13:30') AT TIME ZONE 'Europe/Paris') WHERE user_id = $1`, [NINA, D]);
await asService();
await run(`SELECT public.close_forgotten_sessions($1)`, [NINA]);
r = await one(`SELECT exit_forgotten, to_char(end_time,'HH24:MI') AS e FROM public.time_entries WHERE user_id = $1 AND start_time = '13:30'`, [NINA]);
check(r && r.exit_forgotten && r.e === '17:00', 'fin = heure prévue (17:00), badge « sortie oubliée »');

// Jour clos : impossible d'avoir un chrono ouvert dessus (les gardes du mois et
// du lot 11 refusent la clôture tant qu'un chrono est ouvert) ; la fonction
// saute quand même ces jours, par prudence.
console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
