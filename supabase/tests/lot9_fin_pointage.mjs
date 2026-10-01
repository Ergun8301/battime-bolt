// Lot 9 — `finish_active_session` rejouée POUR DE VRAI, sur un Postgres jetable
// en mémoire (PGlite, Postgres compilé en WebAssembly). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:fin-pointage        (PGLITE_DIR=… pour un autre dossier)
//
// PGlite n'est PAS une dépendance du projet (rien dans package.json) : il vit
// dans un dossier jetable, hors du dépôt. Le schéma est un BOUCHON minimal
// (auth.uid() lu dans un réglage, companies, active_sessions, time_entries avec
// total_minutes calculé, time_entry_positions, un trigger) ; la migration, elle,
// est chargée TELLE QUELLE depuis supabase/migrations.
//
// L'HORLOGE. `now()` est l'heure de début de transaction : impossible de la
// fixer. Deux bases sont donc montées :
//   · A : la migration mot pour mot — moins d'une minute, 61 s, heure de fin
//     donnée, autre salarié, droits, positions ;
//   · B : la même, où SEUL `now()` est remplacé par une horloge réglable
//     (`public.test_now()`) — pour vérifier les minutes exactes
//     (08:07:40 → 08:14:20 donne 08:07 → 08:15, plafond de minuit…).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(here, '..', 'migrations', '20261001120000_lot9_fin_pointage.sql');
const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';

let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}

const SQL = fs.readFileSync(MIGRATION, 'utf8');
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const CO = 'c0000000-0000-0000-0000-000000000001';
const WS = 'a0000000-0000-0000-0000-000000000001';

const STUB = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.companies (id uuid PRIMARY KEY, position_tracking_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.active_sessions (
  user_id uuid PRIMARY KEY, company_id uuid NOT NULL, worksite_id uuid, planning_id uuid,
  work_date date NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
  start_lat numeric, start_lng numeric, start_accuracy_m integer, start_located_at timestamptz);
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, user_id uuid NOT NULL,
  worksite_id uuid, planning_id uuid, work_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0, meal_allowance boolean NOT NULL DEFAULT false, status text NOT NULL,
  -- Comme en production : calculé par Postgres, nuit comprise (+1440).
  total_minutes integer GENERATED ALWAYS AS (
    (CASE WHEN end_time >= start_time THEN (extract(epoch FROM end_time - start_time) / 60)::int
          ELSE (extract(epoch FROM end_time - start_time) / 60)::int + 1440 END) - break_minutes) STORED);
CREATE TABLE public.time_entry_positions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, company_id uuid, entry_id uuid, user_id uuid, work_date date,
  moment text, latitude numeric, longitude numeric, accuracy_m integer, captured_at timestamptz);
-- Bouchon de trigger : comme en production, c'est le serveur qui pose l'heure
-- de prise (jamais le téléphone). Les tests reculent ensuite started_at par UPDATE.
CREATE FUNCTION public.stub_session_now() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.started_at := now(); RETURN new; END $$;
CREATE TRIGGER stub_session_now BEFORE INSERT ON public.active_sessions FOR EACH ROW EXECUTE FUNCTION public.stub_session_now();
-- Bouchon du garde salarié : une ligne d'heures naît toujours en brouillon.
CREATE FUNCTION public.stub_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF new.status <> 'draft' THEN RAISE EXCEPTION 'brouillon seulement'; END IF; RETURN new; END $$;
CREATE TRIGGER stub_entry_guard BEFORE INSERT ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.stub_entry_guard();
INSERT INTO public.companies VALUES ('${CO}', false);
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };

async function base(withFakeClock) {
  const db = new PGlite();
  await db.exec(STUB);
  if (withFakeClock) {
    await db.exec(`CREATE FUNCTION public.test_now() RETURNS timestamptz LANGUAGE sql STABLE
      AS $$ SELECT current_setting('test.now')::timestamptz $$;`);
    await db.exec(SQL.replace(/now\(\)/g, 'public.test_now()'));
  } else {
    await db.exec(SQL);
  }
  return db;
}
const asUser = (db, uid) => db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid]);
const reset = (db) => db.exec(`DELETE FROM public.active_sessions; DELETE FROM public.time_entries; DELETE FROM public.time_entry_positions;
  UPDATE public.companies SET position_tracking_enabled = false;`);
/** Ouvre un chrono puis recule son heure de prise (`ago` = expression SQL d'horodatage). */
async function openSession(db, uid, startedAtSql, extra = {}) {
  await db.query(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date, start_lat, start_lng, start_accuracy_m)
    VALUES ($1, $2, $3, ((${startedAtSql}) AT TIME ZONE 'Europe/Paris')::date, $4, $5, $6)`,
  [uid, CO, WS, extra.lat ?? null, extra.lng ?? null, extra.acc ?? null]);
  await db.query(`UPDATE public.active_sessions SET started_at = ${startedAtSql} WHERE user_id = $1`, [uid]);
}
const finish = (db, args = {}) => db.query(
  `SELECT entry_id, work_date::text AS work_date, to_char(start_time, 'HH24:MI') AS s, to_char(end_time, 'HH24:MI') AS e, cancelled
     FROM public.finish_active_session(p_end => $1::time, p_lat => $2, p_lng => $3, p_accuracy => $4)`,
  [args.end ?? null, args.lat ?? null, args.lng ?? null, args.acc ?? null]);
const count = async (db, sql, params = []) => Number((await db.query(sql, params)).rows[0].n);

// ───────────────────────── Base A : migration mot pour mot ─────────────────────────
{
  const db = await base(false);

  // 1 · Moins d'une minute → annulé, sans erreur, rien d'écrit.
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `now() - interval '30 seconds'`);
  const r1 = (await finish(db)).rows;
  check(r1.length === 1 && r1[0].cancelled === true && r1[0].entry_id === null, '< 60 s : une ligne « cancelled = true », sans erreur');
  check(await count(db, `SELECT count(*) n FROM public.time_entries`) === 0, '< 60 s : aucune ligne d’heures');
  check(await count(db, `SELECT count(*) n FROM public.active_sessions`) === 0, '< 60 s : le chrono est effacé');

  // 2 · 61 s → une ligne, début ≤ vrai début, fin ≥ vraie fin, au plus +2 min.
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `now() - interval '61 seconds'`);
  const r2 = (await finish(db)).rows;
  const truth = (await db.query(`SELECT to_char((now() - interval '61 seconds') AT TIME ZONE 'Europe/Paris', 'HH24:MI:SS') AS s,
    to_char(now() AT TIME ZONE 'Europe/Paris', 'HH24:MI:SS') AS e`)).rows[0];
  const e2 = (await db.query(`SELECT to_char(start_time, 'HH24:MI:SS') s, to_char(end_time, 'HH24:MI:SS') e, total_minutes, status, meal_allowance
    FROM public.time_entries`)).rows;
  check(r2.length === 1 && r2[0].cancelled === false && !!r2[0].entry_id, '61 s : une ligne créée, cancelled = false');
  check(e2.length === 1 && e2[0].s <= truth.s, `61 s : début ${e2[0]?.s} ≤ vrai début ${truth.s}`);
  // (Hors 23:59:xx, où la ligne reste sur son jour : 23:59 tout au plus.)
  check(e2.length === 1 && (e2[0].e >= truth.e || e2[0].e === '23:59:00'), `61 s : fin ${e2[0]?.e} ≥ vraie fin ${truth.e}`);
  check(e2.length === 1 && e2[0].total_minutes >= 1 && e2[0].total_minutes <= 3, `61 s : ${e2[0]?.total_minutes} min comptées (1 à 3, jamais moins que le réel arrondi)`);
  check(e2.length === 1 && e2[0].status === 'draft' && e2[0].meal_allowance === false, '61 s : brouillon, panier non coché (comme stop_active_session)');
  check(await count(db, `SELECT count(*) n FROM public.active_sessions`) === 0, '61 s : le chrono est fermé');

  // 3 · Heure de fin donnée (pointage oublié) → prise telle quelle, à la minute.
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-09-30 07:31:10 Europe/Paris'`);
  const r3 = (await finish(db, { end: '16:52:40' })).rows;
  check(r3.length === 1 && r3[0].s === '07:31' && r3[0].e === '16:52' && r3[0].work_date === '2026-09-30',
    `p_end : 07:31:10 → 16:52 donne ${r3[0]?.s}–${r3[0]?.e} le ${r3[0]?.work_date}`);
  check(await count(db, `SELECT count(*) n FROM public.time_entries WHERE total_minutes = 561`) === 1, 'p_end : 9 h 21 comptées exactement');

  // 4 · Heure de fin ≤ début → annulation silencieuse.
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-09-30 16:58:30 Europe/Paris'`);
  const r4 = (await finish(db, { end: '16:58' })).rows;
  check(r4.length === 1 && r4[0].cancelled === true, 'p_end = début : annulé sans erreur');
  check(await count(db, `SELECT count(*) n FROM public.time_entries`) === 0 && await count(db, `SELECT count(*) n FROM public.active_sessions`) === 0,
    'p_end = début : ni ligne, ni chrono');

  // 5 · Le chrono d'un AUTRE salarié n'est pas touché.
  await reset(db);
  await openSession(db, U1, `now() - interval '2 hours'`);
  await openSession(db, U2, `now() - interval '3 hours'`);
  await asUser(db, U1);
  await finish(db);
  check(await count(db, `SELECT count(*) n FROM public.active_sessions WHERE user_id = $1`, [U2]) === 1, 'autre salarié : son chrono reste ouvert');
  check(await count(db, `SELECT count(*) n FROM public.time_entries WHERE user_id = $1`, [U2]) === 0, 'autre salarié : aucune ligne à son nom');
  check(await count(db, `SELECT count(*) n FROM public.time_entries WHERE user_id = $1`, [U1]) === 1, 'moi : une ligne');

  // 6 · Sans chrono → refus clair (comme stop_active_session).
  await reset(db); await asUser(db, U1);
  let err6 = '';
  try { await finish(db); } catch (e) { err6 = e.message; }
  check(/Aucun pointage en cours/.test(err6), `sans chrono : « ${err6} »`);

  // 7 · Positions : même bloc que stop_active_session.
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `now() - interval '2 hours'`, { lat: 45.76, lng: 4.83, acc: 12 });
  await finish(db, { lat: 45.77, lng: 4.84, acc: 9 });
  check(await count(db, `SELECT count(*) n FROM public.time_entry_positions`) === 0, 'positions : interrupteur éteint → rien n’est gardé');
  await reset(db); await asUser(db, U1);
  await db.exec(`UPDATE public.companies SET position_tracking_enabled = true`);
  await openSession(db, U1, `now() - interval '2 hours'`, { lat: 45.76, lng: 4.83, acc: 12 });
  await finish(db, { lat: 45.77, lng: 4.84, acc: 9 });
  check(await count(db, `SELECT count(*) n FROM public.time_entry_positions WHERE moment IN ('start','end')`) === 2, 'positions : interrupteur allumé → départ + fin');
  await reset(db); await asUser(db, U1);
  await db.exec(`UPDATE public.companies SET position_tracking_enabled = true`);
  await openSession(db, U1, `now() - interval '15 hours'`, { lat: 45.76, lng: 4.83, acc: 12 });
  await finish(db, { end: '20:00', lat: 45.77, lng: 4.84, acc: 9 });
  check(await count(db, `SELECT count(*) n FROM public.time_entry_positions WHERE moment = 'end'`) === 0, 'positions : au-delà de 14 h, pas de position de fin (domicile)');

  // 8 · Droits : anon NON, authenticated OUI (lu en base ET dans le texte).
  const sig = `'public.finish_active_session(time, numeric, numeric, integer)'`;
  const priv = (await db.query(`SELECT has_function_privilege('anon', ${sig}, 'EXECUTE') a,
    has_function_privilege('authenticated', ${sig}, 'EXECUTE') u, has_function_privilege('public', ${sig}, 'EXECUTE') p`)).rows[0];
  check(priv.a === false, 'droits : anon ne peut pas exécuter');
  check(priv.p === false, 'droits : PUBLIC ne peut pas exécuter');
  check(priv.u === true, 'droits : authenticated peut exécuter');
  check(/REVOKE EXECUTE ON FUNCTION public\.finish_active_session\(time, numeric, numeric, integer\) FROM PUBLIC, anon;/.test(SQL)
    && /GRANT\s+EXECUTE ON FUNCTION public\.finish_active_session\(time, numeric, numeric, integer\) TO authenticated;/.test(SQL),
  'droits : REVOKE … FROM PUBLIC, anon et GRANT … TO authenticated écrits dans la migration');
  const def = (await db.query(`SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'finish_active_session'`)).rows[0];
  check(def.prosecdef === true && JSON.stringify(def.proconfig).includes('search_path='), 'SECURITY DEFINER et search_path verrouillé');

  // 9 · Additive : rien d'autre que la nouvelle fonction (et ses droits).
  const stmts = SQL.replace(/--.*$/gm, '').replace(/\$fn\$[\s\S]*?\$fn\$/g, '').split(';').map((x) => x.trim()).filter(Boolean);
  check(stmts.every((x) => /^(CREATE FUNCTION public\.finish_active_session|REVOKE EXECUTE|GRANT\s+EXECUTE)/.test(x)),
    `additive : ${stmts.length} instructions, uniquement CREATE FUNCTION / REVOKE / GRANT`);
  await db.close();
}

// ─────────────── Base B : même migration, horloge réglable (minutes exactes) ───────────────
{
  const db = await base(true);
  const at = (paris) => db.query(`SELECT set_config('test.now', $1, false)`, [`${paris} Europe/Paris`]);

  await reset(db); await asUser(db, U1);
  await at('2026-10-01 08:07:40');
  await openSession(db, U1, `timestamptz '2026-10-01 08:07:40 Europe/Paris'`);
  await at('2026-10-01 08:14:20');
  const b1 = (await finish(db)).rows[0];
  check(b1.s === '08:07' && b1.e === '08:15' && !b1.cancelled, `08:07:40 → 08:14:20 donne ${b1.s}–${b1.e} (attendu 08:07–08:15)`);

  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-10-01 08:07:40 Europe/Paris'`);
  await at('2026-10-01 16:52:20');
  const b2 = (await finish(db)).rows[0];
  check(b2.s === '08:07' && b2.e === '16:53', `08:07:40 → 16:52:20 donne ${b2.s}–${b2.e} (l’ancien arrondi donnait 08:15–16:45)`);

  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-10-01 08:00:00 Europe/Paris'`);
  await at('2026-10-01 12:00:00');
  const b3 = (await finish(db)).rows[0];
  check(b3.s === '08:00' && b3.e === '12:00', `minute ronde : 08:00:00 → 12:00:00 donne ${b3.s}–${b3.e} (pas de minute en trop)`);

  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-10-01 10:00:10 Europe/Paris'`);
  await at('2026-10-01 10:01:09');
  const b4 = (await finish(db)).rows[0];
  check(b4.cancelled === true, '59 s exactement : annulé');
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-10-01 10:00:10 Europe/Paris'`);
  await at('2026-10-01 10:01:10');
  const b5 = (await finish(db)).rows[0];
  check(b5.cancelled === false && b5.s === '10:00' && b5.e === '10:02', `60 s pile : compté, ${b5.s}–${b5.e}`);

  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-10-01 22:10:05 Europe/Paris'`);
  await at('2026-10-01 23:59:30');
  const b6 = (await finish(db)).rows[0];
  check(b6.s === '22:10' && b6.e === '23:59' && b6.work_date === '2026-10-01', `plafond de minuit : 23:59:30 donne ${b6.e} sur le ${b6.work_date}`);

  // Nuit à cheval : chrono ouvert la veille à 22:15, fin donnée 06:30 → ligne
  // 22:15–06:30 sur le jour du début, 8 h 15 comptées (+1440 du calcul).
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-09-30 22:15:20 Europe/Paris'`);
  await at('2026-10-01 07:00:00');
  const n1 = (await finish(db, { end: '06:30' })).rows[0];
  check(n1.cancelled === false && n1.s === '22:15' && n1.e === '06:30' && n1.work_date === '2026-09-30',
    `nuit à cheval : veille 22:15 → 06:30 donne ${n1.s}–${n1.e} le ${n1.work_date}, cancelled=${n1.cancelled}`);
  check(await count(db, `SELECT count(*) n FROM public.time_entries WHERE total_minutes = 495`) === 1, 'nuit à cheval : 8 h 15 comptées (495 min)');
  check(await count(db, `SELECT count(*) n FROM public.active_sessions`) === 0, 'nuit à cheval : le chrono est fermé');

  // Même jour, fin avant le début : toujours l'annulation silencieuse.
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-10-01 14:00:00 Europe/Paris'`);
  await at('2026-10-01 18:00:00');
  const n2 = (await finish(db, { end: '09:00' })).rows[0];
  check(n2.cancelled === true && await count(db, `SELECT count(*) n FROM public.time_entries`) === 0
    && await count(db, `SELECT count(*) n FROM public.active_sessions`) === 0, 'même jour, fin avant le début : annulé, ni ligne ni chrono');

  // La veille, fin = début : rien à compter (pas une « nuit » de 0 minute).
  await reset(db); await asUser(db, U1);
  await openSession(db, U1, `timestamptz '2026-09-30 17:00:20 Europe/Paris'`);
  await at('2026-10-01 08:00:00');
  const n3 = (await finish(db, { end: '17:00' })).rows[0];
  check(n3.cancelled === true && await count(db, `SELECT count(*) n FROM public.time_entries`) === 0, 'la veille, fin = début : annulé');

  // Serveur réglé sur un autre fuseau : les heures restent celles de Paris.
  await reset(db); await asUser(db, U1);
  await db.exec(`SET TimeZone = 'America/New_York'`);
  await openSession(db, U1, `timestamptz '2026-10-01 07:45:59 Europe/Paris'`);
  await at('2026-10-01 09:00:01');
  const b7 = (await finish(db)).rows[0];
  check(b7.s === '07:45' && b7.e === '09:01', `fuseau du serveur ignoré : ${b7.s}–${b7.e} (heure de Paris)`);
  await db.close();
}

console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
