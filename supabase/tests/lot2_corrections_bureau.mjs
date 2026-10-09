// Lot 2 (bureau) — corrections avec motif, « Renvoyer au salarié », pause /
// panier / route. Rejoué POUR DE VRAI sur un Postgres jetable (PGlite). Jamais
// sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:corrections-bureau
//
// Même bouchon que les lots 11, 12 et 14 (fonctions et policies de PRODUCTION
// recopiées mot pour mot), plus ce que la production a et que le bouchon n'a
// pas : gap_before en texte avec sa contrainte, l'index « un panier par jour »,
// la clé étrangère du journal des corrections, et les droits PAR DÉFAUT de
// production (tout pour anon / authenticated sur les objets neufs) — pour
// prouver que la migration les reprend bien. Les migrations des lots 9, 11, 12
// et 14 puis celle du lot 2 sont chargées TELLES QUELLES.
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
const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b'; // bureau d'une AUTRE entreprise
const CHEF = '30000000-0000-0000-0000-000000000003';
const SAM = '10000000-0000-0000-0000-000000000001';
const ALEX = '20000000-0000-0000-0000-000000000002';
const ANCIEN = '60000000-0000-0000-0000-000000000006'; // salarié archivé
const AUTRE = '70000000-0000-0000-0000-000000000007'; // salarié de l'autre entreprise
const WS = 'e0000000-0000-0000-0000-000000000001';
const WS2 = 'e0000000-0000-0000-0000-000000000002';

const EXTRA = `
ALTER TABLE public.companies ADD COLUMN kiosk_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.time_entries ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
CREATE TABLE public.kiosks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, revoked_at timestamptz);
CREATE TABLE public.planning (id uuid PRIMARY KEY, user_id uuid, work_date date, estimated_end time);
GRANT ALL ON public.kiosks, public.planning TO service_role;

-- Comme en PRODUCTION : gap_before est un texte (route / pause / NULL), et un
-- seul panier par jour sur les lignes vivantes.
ALTER TABLE public.time_entries ALTER COLUMN gap_before TYPE text USING NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_gap_before_check CHECK (gap_before IS NULL OR gap_before IN ('route', 'pause'));
CREATE UNIQUE INDEX time_entries_one_meal_per_day ON public.time_entries (user_id, work_date) WHERE meal_allowance AND status <> 'cancelled';

CREATE FUNCTION public.is_lead() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'lead' AND is_active IS DISTINCT FROM false) $$;

-- Journal des corrections + correct_time_entry, de PRODUCTION (étape 25).
CREATE TABLE public.time_entry_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL,
  entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE, worker_id uuid NOT NULL,
  work_date date NOT NULL, corrected_by uuid NOT NULL, corrected_by_role text NOT NULL, corrected_at timestamptz NOT NULL DEFAULT now(),
  old_start time NOT NULL, old_end time NOT NULL, new_start time NOT NULL, new_end time NOT NULL, was_exported boolean NOT NULL,
  notified_at timestamptz, notify_error text,
  CONSTRAINT time_entry_corrections_change_reelle CHECK ((old_start, old_end) IS DISTINCT FROM (new_start, new_end)));
ALTER TABLE public.time_entry_corrections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.time_entry_corrections TO authenticated;
CREATE POLICY time_entry_corrections_insert ON public.time_entry_corrections FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_my_company_id()) AND (corrected_by = auth.uid()) AND (is_admin() OR is_my_team_member(worker_id, work_date)));
CREATE POLICY time_entry_corrections_select ON public.time_entry_corrections FOR SELECT TO authenticated
  USING ((company_id = get_my_company_id()) AND (is_admin() OR (worker_id = auth.uid()) OR (corrected_by = auth.uid())));

INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Admin', 'Test'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau'),
  ('${CHEF}', '${CO}', 'lead', true, 'Chef', 'Test'),
  ('${SAM}', '${CO}', 'worker', true, 'Sam', 'Test'),
  ('${ALEX}', '${CO}', 'worker', true, 'Alex', 'Test'),
  ('${ANCIEN}', '${CO}', 'worker', false, 'Ancien', 'Test'),
  ('${AUTRE}', '${CO2}', 'worker', true, 'Autre', 'Salarié');
INSERT INTO public.worksites VALUES ('${WS}', '${CO}'), ('${WS2}', '${CO}');
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const db = new PGlite();
await db.exec(STUB);
await db.exec(EXTRA);
await db.exec(mig('20261001120000_lot9_fin_pointage.sql'));
await db.exec(mig('20261002120000_lot11_cloture_salarie.sql'));
await db.exec(mig('20261003120000_lot12_pointage_qr.sql'));
await db.exec(mig('20261006120000_lot14_chef_equipe_7_jours.sql'));

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
const EXISTING_FN = ['get_my_company_id', 'is_admin', 'is_lead', 'is_month_closed', 'is_my_team_member', 'guard_time_entry_write',
  'guard_time_entry_delete', 'guard_time_entry_user_closure', 'guard_time_entry_qr', 'guard_time_entry_lead', 'user_closed_until',
  'correct_time_entry', 'finish_active_session', 'mark_reserve_fixed'];
const fnPrint = async () => (await db.query(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [EXISTING_FN])).rows[0].s;
const polPrint = async () => (await db.query(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s
  FROM pg_policies WHERE tablename <> 'time_entry_edits'`)).rows[0].s;
const trgPrint = async () => (await db.query(`SELECT string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname) AS s
  FROM pg_trigger WHERE NOT tgisinternal AND tgname NOT IN ('time_entries_keep_sent', 'time_entries_guard_write_returned')`)).rows[0].s;
const colPrint = async () => (await db.query(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type, ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'time_entry_edits'`)).rows[0].s;
const before = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint() };
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et
// authenticated. La migration doit les reprendre elle-même.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
const SQL2 = mig('20261009120000_lot2_corrections_bureau.sql');
await db.exec(SQL2);
await db.exec(SQL2);
const after = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint() };
check(before.fn === after.fn, 'fonctions existantes inchangées (correct_time_entry, gardes, clôtures…)');
check(before.pol === after.pol, 'policies existantes inchangées');
check(before.trg === after.trg, 'triggers existants inchangés');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée sur les tables existantes');
const ownPol = (await db.query(`SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) AS s FROM pg_policies WHERE tablename = 'time_entry_edits'`)).rows[0].s;
check(ownPol === 'time_entry_edits_select:SELECT', `journal : une seule policy, en lecture, limitée à l'entreprise (pas de support_read) : ${ownPol}`);
check(!/\b(DROP\s+(TABLE|COLUMN|FUNCTION)|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|DELETE\s+FROM)\b/i.test(SQL2.split('-- RETOUR ARRIÈRE')[0]), 'migration additive et rejouable (chargée deux fois)');
const priv = (await db.query(`SELECT
  has_table_privilege('anon', 'public.time_entry_edits', 'SELECT') AS anon_sel,
  has_table_privilege('authenticated', 'public.time_entry_edits', 'INSERT') AS auth_ins,
  has_table_privilege('authenticated', 'public.time_entry_edits', 'UPDATE') AS auth_upd,
  has_table_privilege('authenticated', 'public.time_entry_edits', 'DELETE') AS auth_del,
  has_table_privilege('authenticated', 'public.time_entry_edits', 'SELECT') AS auth_sel,
  has_function_privilege('anon', 'public.office_correct_entry(uuid, jsonb, text)', 'EXECUTE') AS anon_fn1,
  has_function_privilege('anon', 'public.office_return_day(uuid, date, text)', 'EXECUTE') AS anon_fn2,
  has_function_privilege('anon', 'public.office_edit_mark_notified(uuid[], text)', 'EXECUTE') AS anon_fn3,
  has_function_privilege('authenticated', 'public.guard_time_entry_keep_sent()', 'EXECUTE') AS auth_trg,
  has_function_privilege('authenticated', 'public.guard_time_entry_returned_trace()', 'EXECUTE') AS auth_trg2,
  has_function_privilege('anon', 'public.guard_time_entry_returned_trace()', 'EXECUTE') AS anon_trg2,
  has_function_privilege('authenticated', 'public.office_return_day(uuid, date, text)', 'EXECUTE') AS auth_fn`)).rows[0];
check(!priv.anon_sel && !priv.auth_ins && !priv.auth_upd && !priv.auth_del && priv.auth_sel, 'journal : lecture seule pour authenticated, rien pour anon (malgré les droits par défaut)');
check(!priv.anon_fn1 && !priv.anon_fn2 && !priv.anon_fn3 && !priv.auth_trg && priv.auth_fn, 'fonctions : anon exclu, fonction de trigger non appelable');
check(!priv.auth_trg2 && !priv.anon_trg2, 'trace après renvoi : fonction de trigger non appelable (ni authenticated, ni anon)');
// La trace après renvoi passe APRÈS la garde existante (ordre alphabétique des triggers BEFORE).
const order = (await db.query(`SELECT tgname, prosecdef, proconfig FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.time_entries'::regclass AND NOT t.tgisinternal ORDER BY tgname`)).rows;
const iW = order.findIndex((x) => x.tgname === 'time_entries_guard_write');
const iR = order.findIndex((x) => x.tgname === 'time_entries_guard_write_returned');
check(iW >= 0 && iR === iW + 1, `time_entries_guard_write_returned juste après time_entries_guard_write (${order.map((x) => x.tgname).join(', ')})`);
check(order[iR]?.prosecdef === true && JSON.stringify(order[iR]?.proconfig || []).includes('search_path='), 'trace après renvoi : SECURITY DEFINER, search_path vide');

// ═══ Outils ═══════════════════════════════════════════════════════════════
const as = async (uid, role = 'authenticated') => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); if (role) await db.exec(`SET ROLE ${role}`); };
const run = async (sql, params = []) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message, code: e.code }; } };
const refused = async (sql, params, needle, label) => {
  const r = await run(sql, params);
  const good = !r.ok && (needle instanceof RegExp ? needle.test(r.err) : r.err.includes(needle));
  check(good, `${label}${r.ok ? ' — ACCEPTÉ à tort' : good ? ` (« ${r.err} »)` : ` — refus inattendu : « ${r.err} »`}`);
  return r;
};
const accepted = async (sql, params, label) => { const r = await run(sql, params); check(r.ok, `${label}${r.ok ? '' : ` — refusé : « ${r.err} »`}`); return r; };
// Écritures et lectures « système » : superutilisateur ET auth.uid() nul.
const one = async (sql, params = []) => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); return (await db.query(sql, params)).rows[0]; };
const all = async (sql, params = []) => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); return (await db.query(sql, params)).rows; };
const ligne = async (o) => (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status,
    break_minutes, meal_allowance, gap_before, locked, exported_at, submitted_at)
  VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
  [o.co ?? CO, o.user ?? SAM, o.ws ?? WS, o.date, o.start, o.end, o.status ?? 'submitted', o.brk ?? 0, o.meal ?? false, o.gap ?? null,
    o.locked ?? false, o.exported ?? null, o.status === 'draft' && !o.sent ? null : (o.submittedAt ?? new Date().toISOString())])).id;
const CORR = `SELECT * FROM public.office_correct_entry($1, $2::jsonb, $3)`;
const RET = `SELECT * FROM public.office_return_day($1, $2::date, $3)`;
const etat = (id) => one(`SELECT start_time::text AS s, end_time::text AS e, break_minutes AS b, meal_allowance AS m, gap_before AS g, status,
  modified_at, modified_by, submitted_at, total_minutes AS t FROM public.time_entries WHERE id = $1`, [id]);
const editsOf = (id) => all(`SELECT * FROM public.time_entry_edits WHERE entry_id = $1 ORDER BY edited_at, id`, [id]);
const corrsOf = (id) => all(`SELECT * FROM public.time_entry_corrections WHERE entry_id = $1`, [id]);

// Jours PASSÉS (une clôture de salarié ne se pose pas dans le futur), relatifs à aujourd'hui.
const d = (n) => { const x = new Date(); x.setUTCHours(12, 0, 0, 0); x.setUTCDate(x.getUTCDate() - 40 + n); return x.toISOString().slice(0, 10); };

// ═══ Corriger la pause d'une ligne envoyée ═════════════════════════════════
const e1 = await ligne({ date: d(1), start: '08:00', end: '17:00' });
await as(ADMIN);
let r = await accepted(CORR, [e1, '{"break_minutes":30}', 'pause oubliée'], 'bureau : pause 0 → 30 min, motif « pause oubliée »');
let row = await etat(e1);
check(row.b === 30 && row.t === 510, `ligne corrigée : pause 30, 8h30 comptées (${row.t} min)`);
check(row.modified_by === ADMIN && row.modified_at, 'modified_at / modified_by = le bureau (posé par la garde existante)');
let ed = await editsOf(e1);
check(ed.length === 1 && ed[0].kind === 'correction' && ed[0].reason === 'pause oubliée' && ed[0].edited_by === ADMIN
  && ed[0].old_values.break_minutes === 0 && ed[0].new_values.break_minutes === 30 && ed[0].correction_id === null, 'journal : une ligne, avant 0 / après 30, motif, auteur');
check(r.rows?.length === 1 && r.rows[0].id === ed[0].id, 'la fonction rend la ligne de journal écrite');
check((await corrsOf(e1)).length === 0, 'pause seule : AUCUNE ligne dans time_entry_corrections (sa contrainte l’interdirait)');

// ═══ Début / fin : les deux journaux, liés ═════════════════════════════════
await as(ADMIN);
r = await accepted(CORR, [e1, '{"end_time":"16:30","start_time":"08:00"}', 'parti plus tôt'], 'bureau : fin 17:00 → 16:30 (début renvoyé identique)');
const corr = await corrsOf(e1);
ed = await editsOf(e1);
check(corr.length === 1 && corr[0].old_end === '17:00:00' && corr[0].new_end === '16:30:00' && corr[0].corrected_by_role === 'admin', 'time_entry_corrections : une ligne (les écrans actuels la lisent)');
check(ed.length === 2 && ed[1].correction_id === corr[0].id && ed[1].old_values.end_time === '17:00' && ed[1].new_values.end_time === '16:30', 'journal lié par correction_id, avant / après');
check((await etat(e1)).s === '08:00:00', 'le début renvoyé identique n’est pas réécrit');

// ═══ Panier déplacé d'une ligne à l'autre ═════════════════════════════════
const pA = await ligne({ date: d(2), start: '08:00', end: '12:00' });
const pB = await ligne({ date: d(2), start: '13:00', end: '17:00', meal: true });
await as(ADMIN);
r = await accepted(CORR, [pA, '{"meal_allowance":true}', 'panier sur le chantier du matin'], 'bureau : panier sur la ligne A alors que B l’a');
check(r.rows?.length === 2, `deux lignes de journal rendues (${r.rows?.length})`);
check((await etat(pA)).m === true && (await etat(pB)).m === false, 'A a le panier, B ne l’a plus (un seul panier par jour tient)');
const edB = await editsOf(pB);
check(edB.length === 1 && edB[0].old_values.meal_allowance === true && edB[0].new_values.meal_allowance === false && edB[0].reason === 'panier sur le chantier du matin', 'B : « panier retiré » tracé avec le même motif');
const dB = await ligne({ date: d(3), start: '13:00', end: '17:00', status: 'draft', meal: true });
const dA = await ligne({ date: d(3), start: '08:00', end: '12:00' });
await as(ADMIN);
await refused(CORR, [dA, '{"meal_allowance":true}', 'panier'], 'pas encore envoyée', 'panier déjà coché sur un BROUILLON du salarié : refusé (on ne touche pas à son brouillon)');
check((await etat(dB)).m === true, '… son brouillon garde le panier');

// ═══ Route ════════════════════════════════════════════════════════════════
await as(ADMIN);
await accepted(CORR, [pB, '{"gap_before":"route"}', 'trajet entre deux chantiers'], 'bureau : « route » entre 12:00 et 13:00');
ed = await editsOf(pB);
check((await etat(pB)).g === 'route' && ed.at(-1).old_values.gap_before === null && ed.at(-1).new_values.gap_before === 'route', 'route enregistrée, avant / après au journal');
await as(ADMIN);
await accepted(CORR, [pB, '{"gap_before":""}', 'en fait non'], 'bureau : « — » efface la réponse');
check((await etat(pB)).g === null, '… gap_before redevient NULL');

// ═══ Refus ════════════════════════════════════════════════════════════════
await as(ADMIN);
await refused(CORR, [e1, '{"break_minutes":45}', '  '], 'motif', 'motif vide : refusé');
await refused(CORR, [e1, '{"break_minutes":45}', 'ok'], 'motif', 'motif de 2 caractères : refusé');
await refused(CORR, [e1, `{"break_minutes":45}`, 'x'.repeat(501)], 'trop long', 'motif de 501 caractères : refusé');
await accepted(CORR, [e1, '{"break_minutes":45}', 'x'.repeat(500)], 'motif de 500 caractères : accepté');
await refused(CORR, [e1, '{"break_minutes":45}', 'rien de neuf'], 'Rien n', 'rien n’a changé : refusé');
await refused(CORR, [e1, '{"end_time":"16:30"}', 'même heure'], 'Rien n', 'même fin qu’avant : « rien n’a changé »');
await refused(CORR, [e1, '{}', 'vide'], 'non pris en charge', 'aucun changement envoyé : refusé');
await refused(CORR, [e1, '{"break_minutes":510}', 'pause énorme'], 'plus courte', 'pause = durée de la ligne : refusée');
await refused(CORR, [e1, '{"end_time":"08:00"}', 'début = fin'], 'identiques', 'début = fin : refusé');
await refused(CORR, [e1, '{"status":"draft"}', 'brouillon'], 'non pris en charge', 'clé inconnue (status) : refusée');
await refused(CORR, [e1, '{"gap_before":"trajet"}', 'trajet'], 'route ou pause', 'gap_before hors route / pause : refusé');
const nuit = await ligne({ date: d(4), start: '22:00', end: '06:00' });
await as(ADMIN);
await accepted(CORR, [nuit, '{"break_minutes":60}', 'pause de nuit'], 'nuit 22:00–06:00 : pause 1 h acceptée (passage de minuit)');
check((await etat(nuit)).t === 420, 'nuit : 7 h comptées');

// ═══ Chevauchement ════════════════════════════════════════════════════════
await as(ADMIN);
await refused(CORR, [pA, '{"end_time":"13:30"}', 'oubli'], 'chevauchent 13:00–17:00', 'fin 13:30 sur la ligne de 13:00 : refusée');
await accepted(CORR, [pA, '{"end_time":"13:01"}', 'arrondi borne'], 'une minute de recouvrement : tolérée');
const c1 = await ligne({ date: d(5), start: '07:00', end: '13:00' });
const c2 = await ligne({ date: d(5), start: '12:00', end: '18:00' });
await as(ADMIN);
await accepted(CORR, [c2, '{"break_minutes":30}', 'pause oubliée'], 'heures inchangées, ligne qui chevauche DÉJÀ une autre : la pause passe');
await refused(CORR, [c1, '{"end_time":"14:00"}', 'déborde'], 'chevauchent', '… mais bouger ses heures reste refusé');

// ═══ Qui peut corriger ════════════════════════════════════════════════════
await as(SAM);
await refused(CORR, [e1, '{"break_minutes":20}', 'je triche'], 'Réservé au bureau', 'salarié : refusé');
await as(CHEF);
await refused(CORR, [e1, '{"break_minutes":20}', 'je suis chef'], 'Réservé au bureau', 'chef d’équipe : refusé');
await as(ADMIN2);
await refused(CORR, [e1, '{"break_minutes":20}', 'autre boîte'], 'pas accès', 'bureau d’une autre entreprise : refusé (ligne introuvable)');
await as('', 'anon');
await refused(CORR, [e1, '{"break_minutes":20}', 'anonyme'], /permission denied|Réservé/, 'anon : refusé');
const mine = await ligne({ user: ADMIN, date: d(1), start: '08:00', end: '12:00' });
await as(ADMIN);
await refused(CORR, [mine, '{"break_minutes":20}', 'moi-même'], "quelqu'un d'autre", 'le bureau corrige SES propres heures par ce chemin : refusé');

// ═══ Ligne exportée / brouillon ═══════════════════════════════════════════
const exp = await ligne({ date: d(6), start: '08:00', end: '17:00', locked: true, exported: '2026-10-08T10:00:00Z' });
await as(ADMIN);
await accepted(CORR, [exp, '{"break_minutes":60}', 'pause oubliée'], 'ligne exportée : correction acceptée (le bureau décide)');
check((await editsOf(exp))[0]?.was_exported === true, '… was_exported = true au journal');
const dr = await ligne({ date: d(6), user: ALEX, start: '08:00', end: '17:00', status: 'draft' });
await as(ADMIN);
await refused(CORR, [dr, '{"break_minutes":60}', 'pause'], 'brouillon appartient encore au salarié', 'brouillon : refusé');

// ═══ Renvoyer la journée au salarié ═══════════════════════════════════════
const r1 = await ligne({ date: d(7), start: '08:00', end: '12:00' });
const r2 = await ligne({ date: d(7), start: '13:00', end: '17:00' });
const rX = await ligne({ date: d(7), start: '18:00', end: '19:00', status: 'cancelled' });
await as(ADMIN);
r = await accepted(RET, [SAM, d(7), 'il manque le chantier de l’après-midi'], 'bureau : renvoie la journée de Sam');
check(r.rows?.length === 2 && r.rows.every((x) => x.kind === 'return'), 'une ligne de journal « return » par ligne envoyée (la retirée n’est pas touchée)');
const s1 = await etat(r1); const s2 = await etat(r2);
check(s1.status === 'draft' && s2.status === 'draft' && (await etat(rX)).status === 'cancelled', 'les lignes envoyées repassent en brouillon');
check(s1.submitted_at && s2.submitted_at, 'submitted_at reste posé (« déjà envoyée une fois »)');
const rr = (await editsOf(r1))[0];
check(rr.old_values.status === 'submitted' && rr.new_values.status === 'draft' && rr.old_values.start_time === '08:00', 'journal : état complet avant, statut après');

// Refus du renvoi
const rexp = await ligne({ date: d(8), start: '08:00', end: '17:00', exported: '2026-10-09T08:00:00Z' });
await as(ADMIN);
await refused(RET, [SAM, d(8), 'à revoir'], 'chez le comptable', 'journée exportée : renvoi refusé');
check((await etat(rexp)).status === 'submitted', '… rien ne bouge');
await ligne({ date: d(9), start: '08:00', end: '17:00', locked: true });
await as(ADMIN);
await refused(RET, [SAM, d(9), 'à revoir'], 'chez le comptable', 'journée verrouillée : renvoi refusé');
await as(ADMIN);
await refused(RET, [SAM, d(20), 'à revoir'], 'Rien d', 'rien d’envoyé ce jour-là : refusé');
await ligne({ user: ANCIEN, date: d(7), start: '08:00', end: '12:00' });
await as(ADMIN);
await refused(RET, [ANCIEN, d(7), 'à revoir'], 'archivé', 'salarié archivé : refusé');
await as(ADMIN);
await refused(RET, [SAM, d(7), 'no'], 'motif', 'motif trop court : refusé');
await as(SAM);
await refused(RET, [ALEX, d(7), 'à revoir'], 'Réservé au bureau', 'salarié : ne renvoie pas la journée d’un collègue');
await as(ADMIN2);
await refused(RET, [SAM, d(7), 'à revoir'], 'introuvable', 'bureau d’une autre entreprise : salarié introuvable');
// Mois clôturé (janvier 2025, loin des autres jours du test) et salarié clôturé
await ligne({ date: '2025-01-15', start: '08:00', end: '17:00' });
await one(`INSERT INTO public.month_closures (company_id, month) VALUES ($1, '2025-01-01')`, [CO]);
await as(ADMIN);
await refused(RET, [SAM, '2025-01-15', 'à revoir'], 'Mois clôturé', 'mois clôturé : renvoi refusé');
await ligne({ user: ALEX, date: d(4), start: '08:00', end: '17:00' });
await one(`INSERT INTO public.user_closures (user_id, company_id, closed_until, closed_by) VALUES ($1, $2, $3::date, $4)`, [ALEX, CO, d(5), ADMIN]);
await as(ADMIN);
await refused(RET, [ALEX, d(4), 'à revoir'], 'clôturées jusqu', 'salarié clôturé : renvoi refusé');

// ═══ Après un renvoi : le salarié corrige et renvoie ═══════════════════════
check((await etat(r1)).modified_at === null, 'avant : la ligne renvoyée n’a aucune trace de modification');
await as(SAM);
await accepted(`UPDATE public.time_entries SET end_time = '12:30' WHERE id = $1`, [r1], 'Sam corrige sa ligne renvoyée (brouillon)');
const stamped = await etat(r1);
check(stamped.modified_by === SAM && !!stamped.modified_at && stamped.status === 'draft', 'trace après renvoi : modified_at / modified_by = Sam (le bureau verra « modifié »)');
await as(SAM);
await refused(`DELETE FROM public.time_entries WHERE id = $1`, [r2], 'se retirent', 'Sam ne peut PAS effacer une ligne renvoyée (déjà envoyée une fois)');
check(!!(await etat(r2)), '… la ligne et son historique sont toujours là');
await as(SAM);
await accepted(`UPDATE public.time_entries SET status = 'cancelled' WHERE id = $1`, [r2], 'Sam peut la RETIRER (statut « retiré »)');
check((await etat(r2)).status === 'cancelled', '… retirée, visible comme telle');
const before1 = (await etat(r1)).submitted_at;
await as(SAM);
await accepted(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [r1], 'Sam renvoie sa journée');
const after1 = await etat(r1);
check(after1.status === 'submitted' && after1.submitted_at && new Date(after1.submitted_at) >= new Date(before1), 'brouillon → envoyée : submitted_at reposé par la garde existante');
check(after1.modified_by === SAM && String(after1.modified_at) === String(stamped.modified_at), 'renvoi par Sam : la trace posée sur le brouillon est gardée (la garde recopie old.modified_*)');
check((await editsOf(r1)).length === 1, 'l’historique du bureau reste');

// ═══ La trace après renvoi : seulement là où il faut ═══════════════════════
// Renvoyée, puis touchée sans rien changer de suivi (statut seul) : pas de trace.
const t1 = await ligne({ date: d(14), start: '08:00', end: '17:00' });
await as(ADMIN);
await accepted(RET, [SAM, d(14), 'à revoir'], 'bureau : renvoie une autre journée de Sam');
await as(SAM);
await accepted(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [t1], 'Sam la renvoie telle quelle');
check((await etat(t1)).modified_at === null, 'renvoyée sans rien changer : aucune trace (rien à signaler au bureau)');
// Changer ET renvoyer en une seule écriture : tracé.
const t2 = await ligne({ date: d(15), start: '08:00', end: '17:00', meal: true });
await as(ADMIN);
await accepted(RET, [SAM, d(15), 'panier en trop'], 'bureau : renvoie la journée du panier');
await as(SAM);
await accepted(`UPDATE public.time_entries SET meal_allowance = false, status = 'submitted' WHERE id = $1`, [t2], 'Sam retire le panier et renvoie, d’un coup');
let tr = await etat(t2);
check(tr.modified_by === SAM && !!tr.modified_at && tr.status === 'submitted' && tr.m === false, 'panier retiré + renvoi en une écriture : tracé (Sam)');
// Le bureau qui touche une ligne renvoyée : comportement d'avant (sa propre trace, par la garde existante).
const t3 = await ligne({ date: d(16), start: '08:00', end: '17:00' });
await as(ADMIN);
await accepted(RET, [SAM, d(16), 'à revoir'], 'bureau : renvoie une troisième journée');
await as(ADMIN);
await accepted(`UPDATE public.time_entries SET break_minutes = 30 WHERE id = $1`, [t3], 'bureau : retouche directe de la ligne renvoyée');
tr = await etat(t3);
check(tr.modified_by === ADMIN && !!tr.modified_at && tr.b === 30, 'bureau : modified_by = le bureau, comme avant (la trace après renvoi ne s’en mêle pas)');
// Un brouillon JAMAIS envoyé : aucune trace, comme avant.
const t4 = await ligne({ date: d(17), start: '08:00', end: '12:00', status: 'draft' });
await as(SAM);
await accepted(`UPDATE public.time_entries SET end_time = '13:00', observation = 'plus long' WHERE id = $1`, [t4], 'Sam modifie un brouillon jamais envoyé');
tr = await etat(t4);
check(tr.modified_at === null && tr.modified_by === null && tr.e === '13:00:00', 'brouillon jamais envoyé : aucune trace (inchangé)');
// Système (auth.uid() nul) sur une ligne renvoyée : rien.
const t5 = await ligne({ date: d(18), start: '08:00', end: '12:00' });
await as(ADMIN);
await accepted(RET, [SAM, d(18), 'à revoir'], 'bureau : renvoie une quatrième journée');
await one(`UPDATE public.time_entries SET end_time = '12:15' WHERE id = $1`, [t5]);
check((await etat(t5)).modified_at === null, 'écriture système sur une ligne renvoyée : aucune trace');

// ═══ Effacer : jamais des heures envoyées, bureau compris ══════════════════
const sent = await ligne({ date: d(10), start: '08:00', end: '12:00' });
const canc = await ligne({ date: d(10), start: '13:00', end: '14:00', status: 'cancelled' });
await as(ADMIN);
await refused(`DELETE FROM public.time_entries WHERE id = $1`, [sent], 'se retirent', 'bureau : effacer une ligne envoyée → refusé');
await as(ADMIN);
await refused(`DELETE FROM public.time_entries WHERE id = $1`, [canc], 'se retirent', 'bureau : effacer une ligne retirée → refusé');
const fresh = await ligne({ date: d(11), start: '08:00', end: '12:00', status: 'draft' });
await as(SAM);
r = await accepted(`DELETE FROM public.time_entries WHERE id = $1 RETURNING id`, [fresh], 'Sam efface un brouillon jamais envoyé (comme avant)');
check(r.rows?.length === 1, '… effacé');
const freshAdmin = await ligne({ date: d(11), start: '13:00', end: '14:00', status: 'draft' });
await as(ADMIN);
await accepted(`DELETE FROM public.time_entries WHERE id = $1`, [freshAdmin], 'bureau : effacer un brouillon jamais envoyé reste permis');
const svc = await ligne({ date: d(12), start: '08:00', end: '12:00' });
await as('', 'service_role');
await accepted(`DELETE FROM public.time_entries WHERE id = $1`, [svc], 'service_role (auth.uid() nul) : efface une ligne sans historique (inchangé)');
await as('', 'service_role');
await refused(`DELETE FROM public.time_entries WHERE id = $1`, [e1], /foreign key|violates/, 'service_role : une ligne avec historique ne disparaît pas (clé étrangère RESTRICT)');

// ═══ Le journal ne s'écrit pas à la main ═══════════════════════════════════
const someEdit = (await editsOf(e1))[0].id;
for (const [who, label] of [[ADMIN, 'bureau'], [SAM, 'salarié']]) {
  await as(who);
  await refused(`INSERT INTO public.time_entry_edits (company_id, entry_id, worker_id, work_date, kind, reason, edited_by, old_values, new_values)
    VALUES ($1, $2, $3, $4::date, 'correction', 'faux motif', $5, '{"a":1}', '{"a":2}')`, [CO, e1, SAM, d(1), who], 'permission denied', `${label} : INSERT direct dans le journal → refusé`);
  await as(who);
  await refused(`UPDATE public.time_entry_edits SET reason = 'réécrit' WHERE id = $1`, [someEdit], 'permission denied', `${label} : UPDATE direct du journal → refusé`);
  await as(who);
  await refused(`DELETE FROM public.time_entry_edits WHERE id = $1`, [someEdit], 'permission denied', `${label} : DELETE direct du journal → refusé`);
}

// ═══ Qui lit le journal ═══════════════════════════════════════════════════
const alexSent = await ligne({ user: ALEX, date: d(13), start: '08:00', end: '12:00' });
await as(ADMIN);
await accepted(CORR, [alexSent, '{"break_minutes":15}', 'pause d’Alex'], 'bureau : corrige aussi Alex');
// Une ligne de journal dans l'AUTRE entreprise (écrite en « système »).
const otherCo = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status)
  VALUES ($1, $2, NULL, $3::date, '08:00', '12:00', 'submitted') RETURNING id`, [CO2, AUTRE, d(13)])).id;
await one(`INSERT INTO public.time_entry_edits (company_id, entry_id, worker_id, work_date, kind, reason, edited_by, old_values, new_values)
  VALUES ($1, $2, $3, $4::date, 'correction', 'autre entreprise', $5, '{"break_minutes":0}', '{"break_minutes":15}')`, [CO2, otherCo, AUTRE, d(13), ADMIN2]);
await as(SAM);
let seen = (await run(`SELECT worker_id FROM public.time_entry_edits`)).rows || [];
check(seen.length > 0 && seen.every((x) => x.worker_id === SAM), `Sam ne lit que SES lignes de journal (${seen.length})`);
await as(ADMIN);
seen = (await run(`SELECT worker_id, company_id FROM public.time_entry_edits`)).rows || [];
check(seen.some((x) => x.worker_id === ALEX) && seen.every((x) => x.company_id === CO), 'le bureau lit toute SON entreprise');
await as(ADMIN2);
seen = (await run(`SELECT 1 FROM public.time_entry_edits`)).rows || [];
check(seen.length === 1, `le bureau de l’autre entreprise ne lit que SA ligne (${seen.length})`);
await as(CHEF);
seen = (await run(`SELECT 1 FROM public.time_entry_edits`)).rows || [];
check(seen.length === 0, 'le chef d’équipe ne lit pas le journal du bureau');

// ═══ L'issue de la notification ═══════════════════════════════════════════
const ids = (await editsOf(alexSent)).map((x) => x.id);
await as(SAM);
r = await run(`SELECT public.office_edit_mark_notified($1::uuid[], NULL) AS n`, [ids]);
check(r.ok && r.rows[0].n === 0, 'un autre que l’auteur ne marque rien (0 ligne)');
await as(ADMIN);
r = await run(`SELECT public.office_edit_mark_notified($1::uuid[], NULL) AS n`, [ids]);
check(r.ok && r.rows[0].n === 1, 'l’auteur marque « prévenu » (1 ligne)');
await as(ADMIN);
r = await run(`SELECT public.office_edit_mark_notified($1::uuid[], 'aucun appareil') AS n`, [ids]);
check(r.ok && r.rows[0].n === 0 && (await editsOf(alexSent))[0].notify_error === null, '… une seule fois (ne se réécrit pas)');
const pIds = (await editsOf(pA)).map((x) => x.id);
await as(ADMIN);
r = await run(`SELECT public.office_edit_mark_notified($1::uuid[], 'aucun appareil joignable') AS n`, [pIds]);
check(r.ok && r.rows[0].n >= 1 && (await editsOf(pA))[0].notify_error === 'aucun appareil joignable' && !(await editsOf(pA))[0].notified_at, 'échec inscrit : notify_error posé, notified_at reste vide');
await as('', 'anon');
await refused(`SELECT public.office_edit_mark_notified($1::uuid[], NULL)`, [ids], /permission denied|Non connecté/, 'anon : refusé');

console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
