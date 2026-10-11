// Lot 3 — traces des interventions supprimées ou décalées. Rejoué POUR DE VRAI
// sur un Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:traces-db
//
// Même bouchon que les lots 2, 4, 11, 12 et 14 (fonctions et policies de
// PRODUCTION recopiées mot pour mot), puis les VRAIES migrations des lots 9, 11,
// 12, 14, 2 (corrections du bureau) et 4 (tâches, réunions) : les traces sont
// vérifiées sur les vrais chemins (finish_active_session, close_forgotten_sessions,
// office_correct_entry, office_delete_meeting…). Droits PAR DÉFAUT de production
// (tout pour anon / authenticated sur les objets neufs) pour prouver que la
// migration les reprend. La migration est chargée TELLE QUELLE, deux fois ; puis
// son RETOUR ARRIÈRE (décommenté) est exécuté, et elle est rechargée.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const SQL = mig('20261011120000_lot3_traces_suppressions.sql');
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

// Jours PASSÉS du mois en cours ou du précédent (jamais clôturés ici).
const d = (n) => { const x = new Date(); x.setUTCHours(12, 0, 0, 0); x.setUTCDate(x.getUTCDate() - 20 + n); return x.toISOString().slice(0, 10); };
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

const EXTRA = `
ALTER TABLE public.companies ADD COLUMN kiosk_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.time_entries ADD COLUMN created_at timestamptz DEFAULT now();
CREATE TABLE public.kiosks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, revoked_at timestamptz);
-- Le planning, colonnes de production (lib/types.ts), et des policies du même esprit.
CREATE TABLE public.planning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, user_id uuid NOT NULL, worksite_id uuid,
  work_date date NOT NULL, estimated_start time, estimated_end time, notes text, absence_type text, position integer,
  added_by_worker boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid);
ALTER TABLE public.planning ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning TO authenticated;
GRANT ALL ON public.kiosks, public.planning TO service_role;
CREATE POLICY planning_admin_all ON public.planning FOR ALL TO authenticated
  USING (company_id = get_my_company_id() AND is_admin()) WITH CHECK (company_id = get_my_company_id() AND is_admin());
CREATE POLICY planning_select_own ON public.planning FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND user_id = auth.uid());

ALTER TABLE public.time_entries ALTER COLUMN gap_before TYPE text USING NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_gap_before_check CHECK (gap_before IS NULL OR gap_before IN ('route', 'pause'));

CREATE FUNCTION public.is_lead() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'lead' AND is_active IS DISTINCT FROM false) $$;
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
-- La policy de PRODUCTION sur users (la policy d'insertion des tâches la lit).
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_company ON public.users FOR SELECT TO authenticated USING ((company_id = get_my_company_id()) OR (id = auth.uid()));
`;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);
const db = new PGlite();
await db.exec(STUB);
await db.exec(EXTRA);
for (const f of ['20261001120000_lot9_fin_pointage.sql', '20261002120000_lot11_cloture_salarie.sql', '20261003120000_lot12_pointage_qr.sql',
  '20261006120000_lot14_chef_equipe_7_jours.sql', '20261009120000_lot2_corrections_bureau.sql', '20261010170000_lot4_missions_reunions.sql']) {
  await db.exec(mig(f));
}

const setHeaders = async (h) => { await db.query(`SELECT set_config('request.headers', $1, false)`, [h ? JSON.stringify(h) : '']); };
const as = async (uid, role = 'authenticated', headers = null) => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await setHeaders(headers);
  await db.exec(`SET ROLE ${role}`);
};
const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); await setHeaders(null); };
const err = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return e.code || e.message; } };
const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];
const count = async (sql, p = []) => Number((await one(sql, p)).n);
// Les traces, lues comme la base les a écrites (superutilisateur).
const tracesOf = async (objectId) => { await root(); return rows(`SELECT * FROM public.traces WHERE object_id = $1 ORDER BY id`, [objectId]); };
const nTraces = async () => { await root(); return count(`SELECT count(*) n FROM public.traces`); };
const last = async () => { await root(); return one(`SELECT * FROM public.traces ORDER BY id DESC LIMIT 1`); };

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
const NEW_FNS = ['traces_capture', 'traces_meeting', 'traces_classify', 'traces_author', 'traces_origin'];

// ═══ La migration : additive, rejouable, droits repris ═════════════════════
section('Migration : additive, rejouable, droits repris malgré les droits par défaut');
const fnPrint = async () => (await one(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND NOT (proname = ANY($1))`, [NEW_FNS])).s;
const polPrint = async () => (await one(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s
  FROM pg_policies WHERE tablename <> 'traces'`)).s;
const trgPrint = async () => (await one(`SELECT coalesce(string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname), '') AS s
  FROM pg_trigger WHERE NOT tgisinternal AND tgname NOT LIKE 'traces\\_%'`)).s;
const colPrint = async () => (await one(`SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name) AS s
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'traces'`)).s;
const privPrint = async () => JSON.stringify(await rows(`SELECT c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS p
  FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname <> 'traces' ORDER BY 1, 2`));
const prints = async () => ({ fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint(), col: await colPrint(), priv: await privPrint() });
await root();
const before = await prints();
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
await db.exec(SQL);
await db.exec(SQL);
check(true, 'migration chargée deux fois de suite sans erreur (rejouable)');
const after = await prints();
check(before.fn === after.fn, 'fonctions existantes inchangées (gardes des heures, finish_active_session, office_correct_entry, réunions…)');
check(before.pol === after.pol, 'policies existantes inchangées (planning, time_entries, active_sessions, day_tasks, meetings…)');
check(before.trg === after.trg, 'triggers existants inchangés (seuls des triggers « traces_… » neufs sont ajoutés)');
check(before.col === after.col, 'aucune colonne ajoutée ni modifiée sur les tables existantes');
check(before.priv === after.priv, 'droits des tables existantes inchangés');
{
  // Hors du bloc de retour arrière (et hors commentaires) : ni DROP, ni DELETE en instruction,
  // ni RENAME / ALTER COLUMN / ALTER POLICY / UPDATE de données. DELETE n'y est qu'un ÉVÉNEMENT.
  const code = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  check(!/\bDROP\b/i.test(code), 'aucun DROP exécuté (seulement dans le retour arrière commenté)');
  const deletes = code.match(/'?\bDELETE\b[^\n]*/gi) || [];
  check(deletes.length > 0 && deletes.every((l) => /^DELETE', '(REFERENCING OLD TABLE|FOR EACH ROW)/.test(l) || /^'DELETE' THEN\b/.test(l)),
    `DELETE n'apparaît que comme événement de déclencheur ou valeur de TG_OP (${deletes.length} fois), jamais en instruction`);
  check(!/\b(RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|UPDATE\s+public\.|TRUNCATE)\b/i.test(code), 'aucun RENAME / ALTER COLUMN / ALTER POLICY / UPDATE de données');
}
check(!!POST_SQL && !!ROLLBACK_SQL, 'en-tête : vérification après application et retour arrière présents (blocs commentés)');
check(/INSERT INTO supabase_migrations\.schema_migrations \(version, name\)\n--\s+VALUES \('20261011120000', 'lot3_traces_suppressions'\) ON CONFLICT DO NOTHING;/.test(SQL),
  'en-tête : ligne d’historique (version + nom du fichier)');
{
  const v = await one(POST_SQL);
  const bad = Object.entries(v).filter(([, x]) => x !== true).map(([k]) => k);
  check(Object.keys(v).length === 9 && bad.length === 0, `vérification après application : 9 colonnes à true${bad.length ? ` (faux : ${bad.join(', ')})` : ''}`);
}
{
  const r = await rows(`SELECT p, role FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p, unnest(ARRAY['authenticated','anon','service_role']) role
    WHERE has_table_privilege(role, 'public.traces', p)`);
  check(r.length === 0, `personne n’écrit, ne modifie ni n’efface une trace — ni anon, ni authenticated, ni le service (${r.map((x) => `${x.role}:${x.p}`).join(' ') || 'aucun droit'})`);
  check(!(await one(`SELECT has_table_privilege('anon', 'public.traces', 'SELECT') AS x`)).x, 'anon : pas même la lecture');
  const seq = await one(`SELECT has_sequence_privilege('authenticated', 'public.traces_id_seq', 'USAGE,UPDATE') OR has_sequence_privilege('anon', 'public.traces_id_seq', 'USAGE,UPDATE') AS x`);
  check(!seq.x, 'compteur des traces : aucun droit pour anon / authenticated');
}

// ═══ Planning ══════════════════════════════════════════════════════════════
section('Planning : supprimée, décalée, modifiée, remise — et le bruit qui ne l’est pas');
await root();
// Cases « anciennes » (posées il y a une heure) : leur suppression est une vraie suppression.
const slot = async (o = {}) => (await one(`INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, estimated_start, estimated_end, notes, created_by, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - interval '1 hour') RETURNING *`,
  [o.co ?? CO, o.user ?? SAM, o.ws ?? WS, o.date ?? d(5), o.start ?? '08:00', o.end ?? '12:00', o.notes ?? null, o.by ?? ADMIN]));
const P1 = await slot();
check(await nTraces() === 0, 'poser des cases : aucune trace (une création n’est pas une intervention supprimée)');
await as(ADMIN);
check((await rows(`DELETE FROM public.planning WHERE id = $1 RETURNING id`, [P1.id])).length === 1, 'le bureau supprime une case de Sam');
let t = await tracesOf(P1.id);
check(t.length === 1 && t[0].action === 'supprimee' && t[0].object_table === 'planning' && t[0].user_id === SAM && t[0].company_id === CO,
  'trace : « supprimée », planning, salarié concerné = Sam, entreprise');
check(t[0].actor_id === ADMIN && t[0].actor_role === 'admin' && t[0].origin === 'ecran', 'qui : le bureau (actor_id, rôle admin), origine « écran » par défaut');
check(String(t[0].work_date).length && t[0].before?.id === P1.id && t[0].before?.estimated_start === '08:00:00' && t[0].before?.worksite_id === WS && t[0].after === null,
  'avant complet (id, heures, chantier…), après vide, jour concerné');
// « Annuler » : la même ligne, même id, remise par upsert (lib/erase.ts restoreRows).
await as(ADMIN);
check(!(await err(`INSERT INTO public.planning SELECT * FROM jsonb_populate_record(NULL::public.planning, $1::jsonb) ON CONFLICT (id) DO UPDATE SET notes = excluded.notes`, [JSON.stringify(t[0].before)])),
  '« Annuler » : la case est remise à l’identique (même id, upsert)');
t = await tracesOf(P1.id);
check(t.length === 2 && t[1].action === 'remise' && t[1].after?.id === P1.id && t[1].before === null, 'trace : « remise » (même objet, l’après complet)');
// Décalée : jour, puis heure, puis salarié.
await as(ADMIN);
await db.query(`UPDATE public.planning SET work_date = $2 WHERE id = $1`, [P1.id, d(6)]);
t = await tracesOf(P1.id);
check(t.length === 3 && t[2].action === 'decalee' && t[2].before.work_date === d(5) && t[2].after.work_date === d(6) && String(t[2].after.work_date) === d(6),
  'jour changé : « décalée », avant → après (jour)');
await as(ADMIN);
await db.query(`UPDATE public.planning SET estimated_start = '09:00' WHERE id = $1`, [P1.id]);
t = await tracesOf(P1.id);
check(t.length === 4 && t[3].action === 'decalee' && t[3].actor_id === ADMIN && t[3].before.estimated_start === '08:00:00' && t[3].after.estimated_start === '09:00:00', 'heure prévue changée : « décalée », par le bureau');
await as(ADMIN);
await db.query(`UPDATE public.planning SET user_id = $2 WHERE id = $1`, [P1.id, ALEX]);
t = await tracesOf(P1.id);
check(t.length === 6 && t.slice(4).every((x) => x.action === 'decalee' && x.before.user_id === SAM && x.after.user_id === ALEX)
  && t.slice(4).map((x) => x.user_id).sort().join() === [SAM, ALEX].sort().join(), 'salarié changé : « décalée », une ligne pour Sam (elle part) ET une pour Alex (elle arrive)');
await as(ADMIN);
await db.query(`UPDATE public.planning SET worksite_id = $2 WHERE id = $1`, [P1.id, WS2]);
t = await tracesOf(P1.id);
check(t.length === 7 && t[6].action === 'modifiee' && t[6].user_id === ALEX && t[6].before.worksite_id === WS && t[6].after.worksite_id === WS2, 'chantier changé : « modifiée » (une seule ligne)');
const n0 = await nTraces();
await as(ADMIN);
await db.query(`UPDATE public.planning SET position = 3 WHERE id = $1`, [P1.id]);
await db.query(`UPDATE public.planning SET notes = 'Apporter l’échelle' WHERE id = $1`, [P1.id]);
await db.query(`UPDATE public.planning SET work_date = work_date WHERE id = $1`, [P1.id]);
check(await nTraces() === n0, 'bruit : ordre dans la case, consigne, mise à jour sans changement → aucune trace');
// Posée puis retirée aussitôt (« Annuler » d'un ajout) : pas une intervention supprimée.
await as(ADMIN);
const fresh = await one(`INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [CO, SAM, WS, d(7), ADMIN]);
await db.query(`DELETE FROM public.planning WHERE id = $1`, [fresh.id]);
check((await tracesOf(fresh.id)).length === 0, 'case posée puis retirée dans les 5 minutes par la même personne : aucune trace');
// La même, posée par quelqu'un d'autre : tracée.
await root();
const other = await one(`INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [CO, SAM, WS, d(7), CHEF]);
await as(ADMIN);
await db.query(`DELETE FROM public.planning WHERE id = $1`, [other.id]);
check((await tracesOf(other.id)).length === 1, 'case récente posée par quelqu’un d’autre puis supprimée : tracée');

section('Planning : origine (écran, assistant, système, restauration)');
const P2 = await slot({ date: d(8) });
await as(ADMIN, 'authenticated', { 'x-bemexo-origine': 'assistant' });
await db.query(`DELETE FROM public.planning WHERE id = $1`, [P2.id]);
check((await tracesOf(P2.id))[0]?.origin === 'assistant', 'en-tête « x-bemexo-origine: assistant » (appli pendant une action de l’assistant) → origine « assistant »');
const P3 = await slot({ date: d(8) });
await as(ADMIN, 'authenticated', { 'x-bemexo-origine': 'systeme' });
await db.query(`DELETE FROM public.planning WHERE id = $1`, [P3.id]);
check((await tracesOf(P3.id))[0]?.origin === 'ecran', 'un client connecté ne peut pas se dire « système » par l’en-tête → « écran »');
const P4 = await slot({ date: d(8) });
await root();
await db.query(`DELETE FROM public.planning WHERE id = $1`, [P4.id]);
t = await tracesOf(P4.id);
check(t[0]?.origin === 'systeme' && t[0]?.actor_id === null && t[0]?.actor_role === null, 'sans utilisateur (cron, service, éditeur SQL) → « système », auteur NULL');
const P5 = await slot({ date: d(8) });
await root();
await db.exec(`BEGIN`);
await db.query(`SELECT set_config('bemexo.origine', 'restauration', true)`);
await db.query(`DELETE FROM public.planning WHERE id = $1`, [P5.id]);
await db.exec(`COMMIT`);
check((await tracesOf(P5.id))[0]?.origin === 'restauration', 'une fonction serveur pose set_config(\'bemexo.origine\', \'restauration\', true) → « restauration » (lot 8)');
await setHeaders(null);
const P6 = await slot({ date: d(8) });
await db.query(`SELECT set_config('request.headers', '{pas du json', false)`);
await as(ADMIN);
await db.query(`SELECT set_config('request.headers', '{pas du json', false)`);
check(!(await err(`DELETE FROM public.planning WHERE id = $1`, [P6.id])) && (await tracesOf(P6.id))[0]?.origin === 'ecran', 'en-tête illisible : rien n’échoue, origine par défaut');

section('Planning : effacer 100 cases d’un coup = une seule écriture de 100 traces');
await root();
await db.query(`INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, created_by, created_at)
  SELECT $1, $2, $3, $4::date + (g % 20), $5, now() - interval '2 hours' FROM generate_series(1, 100) g`, [CO, ALEX, WS, d(0), ADMIN]);
const nb = await nTraces();
await as(ADMIN);
const delN = (await rows(`DELETE FROM public.planning WHERE user_id = $1 AND company_id = $2 AND notes IS NULL AND created_at < now() - interval '90 minutes' RETURNING id`, [ALEX, CO])).length;
check(delN === 100 && await nTraces() === nb + 100, `100 cases supprimées → 100 traces (${(await nTraces()) - nb})`);

// ═══ Heures ════════════════════════════════════════════════════════════════
section('Heures : brouillon effacé, brouillon vide, ligne retirée, correction du bureau');
await root();
const entry = async (o = {}) => (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status, submitted_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
  [CO, o.user ?? SAM, o.ws ?? WS, o.date ?? d(10), o.start ?? '08:00', o.end ?? '12:00', o.status ?? 'draft', o.status === 'submitted' ? new Date().toISOString() : null]));
check(await nTraces() === nb + 100, 'écrire des heures : aucune trace');
const E1 = await entry();
await as(SAM);
check((await rows(`DELETE FROM public.time_entries WHERE id = $1 RETURNING id`, [E1.id])).length === 1, 'Sam efface son brouillon (4 h notées)');
t = await tracesOf(E1.id);
check(t.length === 1 && t[0].action === 'supprimee' && t[0].object_table === 'time_entries' && t[0].actor_id === SAM && t[0].actor_role === 'worker'
  && t[0].before.start_time === '08:00:00' && t[0].before.end_time === '12:00:00' && t[0].user_id === SAM, 'trace : « supprimée » par Sam lui-même, avant complet (08:00–12:00)');
// « Annuler » de l'assistant salarié : la même ligne réinsérée (même id).
await as(SAM);
const back = { ...t[0].before }; delete back.total_minutes;
{
  const cols = Object.keys(back).join(', ');
  const e = await err(`INSERT INTO public.time_entries (${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::public.time_entries, $1::jsonb)`, [JSON.stringify(back)]);
  check(!e, `« Annuler » : le brouillon est remis (même id)${e ? ` (${e})` : ''}`);
}
t = await tracesOf(E1.id);
check(t.length === 2 && t[1].action === 'remise', 'trace : « remise »');
const E0 = await entry({ start: '08:00', end: '08:00' });
await as(SAM);
await db.query(`DELETE FROM public.time_entries WHERE id = $1`, [E0.id]);
check((await tracesOf(E0.id)).length === 0, 'brouillon VIDE (0 minute) jamais envoyé effacé : aucune trace (il ne compte nulle part)');
const E2 = await entry({ date: d(11) });
await as(SAM);
await db.query(`UPDATE public.time_entries SET end_time = '12:30' WHERE id = $1`, [E2.id]);
await db.query(`UPDATE public.time_entries SET start_time = '07:30', break_minutes = 15 WHERE id = $1`, [E2.id]);
check((await tracesOf(E2.id)).length === 0, 'Sam tape ses propres brouillons (heures, pause) : aucune trace');
await as(SAM);
await db.query(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [E2.id]);
check((await tracesOf(E2.id)).length === 0, 'envoyer sa journée : aucune trace');
await as(SAM);
await db.query(`UPDATE public.time_entries SET end_time = '13:00' WHERE id = $1`, [E2.id]);
t = await tracesOf(E2.id);
check(t.length === 1 && t[0].action === 'decalee' && t[0].actor_id === SAM && t[0].before.end_time === '12:30:00' && t[0].after.end_time === '13:00:00', 'Sam change une ligne DÉJÀ ENVOYÉE : « décalée » par lui, avant → après');
await as(SAM);
await db.query(`UPDATE public.time_entries SET status = 'cancelled' WHERE id = $1`, [E2.id]);
t = await tracesOf(E2.id);
check(t.length === 2 && t[1].action === 'retiree' && t[1].actor_id === SAM && t[1].before.status === 'submitted' && t[1].after.status === 'cancelled', 'Sam retire sa ligne envoyée : « retirée », avec l’avant et l’après');
// Correction du bureau, par la vraie fonction (lot 2).
const E3 = await entry({ date: d(12), status: 'submitted' });
await as(ADMIN);
check(!(await err(`SELECT * FROM public.office_correct_entry($1, $2::jsonb, $3)`, [E3.id, '{"end_time":"11:00"}', 'parti plus tôt'])), 'le bureau corrige la fin (office_correct_entry, motif)');
t = await tracesOf(E3.id);
check(t.length === 1 && t[0].action === 'decalee' && t[0].actor_id === ADMIN && t[0].before.end_time === '12:00:00' && t[0].after.end_time === '11:00:00',
  'trace : « décalée » par le bureau, 12:00 → 11:00 (en plus du journal des corrections)');
await as(ADMIN);
check(!(await err(`SELECT * FROM public.office_correct_entry($1, $2::jsonb, $3)`, [E3.id, '{"break_minutes":30}', 'pause oubliée'])), 'le bureau corrige la pause');
t = await tracesOf(E3.id);
check(t.length === 2 && t[1].action === 'modifiee' && t[1].after.break_minutes === 30, 'pause changée : « modifiée »');
const nE = await nTraces();
await as(ADMIN);
await db.query(`UPDATE public.time_entries SET locked = true, exported_at = now() WHERE id = $1`, [E3.id]);
await db.query(`UPDATE public.time_entries SET observation = 'RAS' WHERE id = $1`, [E3.id]);
check(await nTraces() === nE, 'verrou, export, observation : aucune trace');
// Le chef d'équipe corrige le brouillon d'un salarié de son équipe.
const E4 = await entry({ user: ALEX, date: TODAY });
await as(CHEF);
const chefErr = await err(`UPDATE public.time_entries SET end_time = '11:45' WHERE id = $1`, [E4.id]);
t = await tracesOf(E4.id);
check(!chefErr && t.length === 1 && t[0].action === 'decalee' && t[0].actor_role === 'lead' && t[0].user_id === ALEX,
  `le chef d’équipe change le brouillon d’Alex : « décalée », rôle lead${chefErr ? ` (refus : ${chefErr})` : ''}`);
// Le bureau supprime une ligne envoyée.
// Le bureau supprime un brouillon de Sam (une ligne envoyée, elle, ne s'efface plus : lot 2).
const E5 = await entry({ date: d(13) });
await as(ADMIN);
await db.query(`DELETE FROM public.time_entries WHERE id = $1`, [E5.id]);
t = await tracesOf(E5.id);
check(t.length === 1 && t[0].action === 'supprimee' && t[0].actor_role === 'admin' && t[0].user_id === SAM, 'le bureau supprime un brouillon de Sam : « supprimée » par le bureau');

// ═══ Pointage en cours ═════════════════════════════════════════════════════
section('Pointage en cours : supprimé par le bureau, fermé normalement, moins d’une minute, remis');
await root();
const startSession = async (uid, ago = '2 hours', date = TODAY) => {
  await root();
  await db.query(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date, start_lat, start_lng, start_accuracy_m, start_located_at)
    VALUES ($1, $2, $3, $4, 45.75, 4.85, 12, now())`, [uid, CO, WS, date]);
  await db.query(`UPDATE public.active_sessions SET started_at = now() - $2::interval WHERE user_id = $1`, [uid, ago]);
};
await startSession(SAM);
check((await tracesOf(SAM)).length === 0, 'démarrer un chrono : aucune trace');
await as(ADMIN);
check((await rows(`DELETE FROM public.active_sessions WHERE user_id = $1 RETURNING user_id`, [SAM])).length === 1, 'le bureau supprime le chrono de Sam (policy active_sessions_delete, directement par l’API)');
t = (await tracesOf(SAM)).filter((x) => x.object_table === 'active_sessions');
check(t.length === 1 && t[0].action === 'supprimee' && t[0].actor_id === ADMIN && t[0].user_id === SAM && t[0].object_id === SAM && t[0].before?.started_at,
  'trace : « pointage supprimé » par le bureau, heure de début gardée');
check(!('start_lat' in t[0].before) && !('start_lng' in t[0].before) && !('start_accuracy_m' in t[0].before) && !('start_located_at' in t[0].before),
  'aucune coordonnée GPS recopiée dans la trace');
// « Annuler » : le chrono est remis (même salarié, même jour).
await as(SAM);
check(!(await err(`INSERT INTO public.active_sessions (user_id, company_id, worksite_id, work_date) VALUES ($1, $2, $3, $4)`, [SAM, CO, WS, TODAY])), 'Sam remet son chrono');
t = (await tracesOf(SAM)).filter((x) => x.object_table === 'active_sessions');
check(t.length === 2 && t[1].action === 'remise', 'trace : « remis »');
// Fermé normalement (« J'ai fini ») : la ligne d'heures naît dans la même transaction.
await root();
await db.query(`UPDATE public.active_sessions SET started_at = now() - interval '3 hours' WHERE user_id = $1`, [SAM]);
const nS = await nTraces();
await as(SAM);
const fin = await one(`SELECT * FROM public.finish_active_session(NULL, NULL, NULL, NULL)`);
check(!!fin?.entry_id && !fin.cancelled, '« J’ai fini » (finish_active_session) : une ligne d’heures écrite');
check(await nTraces() === nS, 'chrono fermé normalement : AUCUNE trace (ni le chrono, ni la ligne)');
// Moins d'une minute : un appui de trop.
await startSession(ALEX, '20 seconds');
await as(ALEX);
const short = await one(`SELECT * FROM public.finish_active_session(NULL, NULL, NULL, NULL)`);
check(short?.cancelled === true && await nTraces() === nS, 'chrono de moins d’une minute annulé : aucune trace');
// La nuit : sortie oubliée fermée en brouillon (lot 12).
await startSession(ALEX, '30 hours', d(19));
await root();
const closed = await one(`SELECT public.close_forgotten_sessions($1) AS n`, [ALEX]);
check(Number(closed.n) === 1 && await nTraces() === nS, 'sortie oubliée fermée la nuit (close_forgotten_sessions) : brouillon écrit, aucune trace');
// Sam annule lui-même un chrono ouvert depuis longtemps (assistant « annuler_pointage ») : tracé.
await startSession(SAM, '90 minutes');
await as(SAM, 'authenticated', { 'x-bemexo-origine': 'assistant' });
await db.query(`DELETE FROM public.active_sessions WHERE user_id = $1`, [SAM]);
t = await last();
check(t.object_table === 'active_sessions' && t.action === 'supprimee' && t.actor_id === SAM && t.origin === 'assistant', 'Sam annule son chrono par l’assistant : « supprimé », par lui, origine assistant');

// ═══ Tâches ════════════════════════════════════════════════════════════════
section('Tâches : supprimée tracée, « Fait » non');
await root();
const T1 = await one(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text, part, created_by, created_at) VALUES ($1, $2, $3, 'Ranger le dépôt', 'matin', $4, now() - interval '1 day') RETURNING *`, [CO, SAM, d(15), ADMIN]);
await as(SAM);
await one(`SELECT * FROM public.set_day_task_done($1, true)`, [T1.id]);
await one(`SELECT * FROM public.set_day_task_done($1, false)`, [T1.id]);
check((await tracesOf(T1.id)).length === 0, 'cocher / décocher « Fait » : aucune trace');
await as(ADMIN);
await db.query(`DELETE FROM public.day_tasks WHERE id = $1`, [T1.id]);
t = await tracesOf(T1.id);
check(t.length === 1 && t[0].action === 'supprimee' && t[0].object_table === 'day_tasks' && t[0].user_id === SAM && t[0].before.text === 'Ranger le dépôt', 'tâche supprimée par le bureau : tracée (texte gardé)');
await as(ADMIN);
const T2 = await one(`INSERT INTO public.day_tasks (company_id, user_id, work_date, text) VALUES ($1, $2, $3, 'Tâche en trop') RETURNING id`, [CO, SAM, d(15)]);
await db.query(`DELETE FROM public.day_tasks WHERE id = $1`, [T2.id]);
check((await tracesOf(T2.id)).length === 0, 'tâche ajoutée puis retirée aussitôt par le même bureau : aucune trace');

// ═══ Réunions ══════════════════════════════════════════════════════════════
section('Réunions : supprimée, décalée — un résumé pour le bureau, une ligne par participant');
await as(ADMIN);
const M1 = await one(`SELECT * FROM public.office_save_meeting(NULL, 'Point sécurité', $1, '14:00', NULL, 'Dépôt', false, $2::uuid[])`, [d(16), `{${SAM},${CHEF}}`]);
check((await tracesOf(M1.id)).length === 0, 'poser une réunion : aucune trace');
await as(ADMIN);
await one(`SELECT * FROM public.office_save_meeting($1, 'Point sécurité', $2, '14:00', NULL, 'Dépôt', false, $3::uuid[])`, [M1.id, d(16), `{${SAM},${CHEF},${ALEX}}`]);
check((await tracesOf(M1.id)).length === 0, 'ajouter un participant seulement : aucune trace');
await as(ADMIN);
await one(`SELECT * FROM public.office_save_meeting($1, 'Point sécurité', $2, '15:30', NULL, 'Dépôt', false, $3::uuid[])`, [M1.id, d(16), `{${SAM},${CHEF},${ALEX}}`]);
t = await tracesOf(M1.id);
const sum = t.find((x) => x.user_id === null);
check(t.length === 4 && t.every((x) => x.action === 'decalee') && sum?.before.participants?.length === 3 && sum.before.start_time === '14:00:00' && sum.after.start_time === '15:30:00',
  'heure changée : « décalée » — 1 résumé (avec les 3 participants) + 3 lignes, 14:00 → 15:30');
check(t.filter((x) => x.user_id).every((x) => !('participants' in x.before)), 'les lignes des participants ne contiennent PAS la liste des autres (règle du lot 4)');
await as(ADMIN);
check((await one(`SELECT public.office_delete_meeting($1) AS ok`, [M1.id])).ok === true, 'le bureau retire la réunion (office_delete_meeting)');
t = (await tracesOf(M1.id)).filter((x) => x.action === 'supprimee');
check(t.length === 4 && t.some((x) => x.user_id === SAM) && t.some((x) => x.user_id === CHEF) && t.some((x) => x.user_id === ALEX) && t.find((x) => !x.user_id)?.before.participants.length === 3,
  'réunion supprimée : résumé + Sam, chef d’équipe, Alex (participants lus AVANT la suppression)');
await root();
check(await count(`SELECT count(*) n FROM public.meetings WHERE id = $1`, [M1.id]) === 0 && await count(`SELECT count(*) n FROM public.meeting_participants WHERE meeting_id = $1`, [M1.id]) === 0,
  'la réunion et ses participants sont bien partis (le déclencheur rend la ligne, il ne bloque rien)');
await as(ADMIN);
const M2 = await one(`SELECT * FROM public.office_save_meeting(NULL, 'Équipe', $1, '08:00', NULL, NULL, true, NULL)`, [d(17)]);
await one(`SELECT public.office_delete_meeting($1)`, [M2.id]);
t = await tracesOf(M2.id);
check(t.length === 1 && t[0].user_id === null && t[0].before.all_team === true, '« Toute l’équipe » supprimée : un seul résumé (lisible par toute l’équipe)');

// ═══ Lecture ═══════════════════════════════════════════════════════════════
section('Qui lit quoi');
await root();
const total = await count(`SELECT count(*) n FROM public.traces WHERE company_id = $1`, [CO]);
await root();
await db.query(`INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, created_by, created_at) VALUES ($1, $2, $3, $4, $5, now() - interval '1 day')`, [CO2, AUTRE, null, d(3), ADMIN2]);
await as(ADMIN2);
await db.query(`DELETE FROM public.planning WHERE company_id = $1`, [CO2]);
await as(ADMIN);
check(await count(`SELECT count(*) n FROM public.traces`) === total, `bureau : lit toute son entreprise (${total} traces), rien d’ailleurs`);
await as(ADMIN2);
const r2 = await rows(`SELECT company_id FROM public.traces`);
check(r2.length === 1 && r2[0].company_id === CO2, 'bureau d’une autre entreprise : ne lit que la sienne (1 trace)');
await as(SAM);
const mine = await rows(`SELECT * FROM public.traces`);
check(mine.length > 0 && mine.every((x) => x.user_id === SAM || (x.user_id === null && x.object_table === 'meetings' && x.before?.all_team === true)),
  `Sam : SES lignes seulement (+ la réunion « Toute l’équipe ») — ${mine.length} lignes`);
check(['planning', 'time_entries', 'active_sessions', 'day_tasks', 'meetings'].every((k) => mine.some((x) => x.object_table === k)),
  'Sam voit son planning, ses heures, son chrono, ses tâches, ses réunions');
check(!mine.some((x) => x.before?.participants?.length), 'Sam ne voit jamais la liste des participants (résumé d’une réunion choisie invisible)');
await as(ALEX);
const alex = await rows(`SELECT * FROM public.traces`);
check(!alex.some((x) => x.user_id === SAM), 'Alex ne voit aucune ligne de Sam');
await as(ANCIEN);
check((await rows(`SELECT * FROM public.traces`)).length === 0, 'salarié archivé : ne lit rien');
await as(AUTRE);
const autre = await rows(`SELECT * FROM public.traces`);
check(autre.length === 1 && autre[0].company_id === CO2 && autre[0].user_id === AUTRE, 'salarié d’une autre entreprise : seulement SA ligne, rien de la nôtre');
await as('', 'anon');
check((await err(`SELECT * FROM public.traces`)) === '42501', 'anonyme : lecture refusée (42501)');
// Un type futur (ex. une trace qui ne concerne pas le salarié) ne lui serait pas montré : la policy liste les types.
check(/object_table IN \('planning', 'time_entries', 'active_sessions', 'day_tasks', 'meetings'\)/.test(SQL.split('traces_select_own ON')[1] || ''),
  'policy salarié : limitée aux 5 types qui le concernent');

section('Personne n’écrit, ne modifie ni n’efface une trace');
await root();
const anyId = (await one(`SELECT id FROM public.traces WHERE user_id = $1 ORDER BY id LIMIT 1`, [SAM])).id;
for (const [who, uid] of [['Sam', SAM], ['le bureau', ADMIN]]) {
  await as(uid);
  check(await err(`INSERT INTO public.traces (company_id, user_id, origin, action, object_table, object_id) VALUES ($1, $2, 'ecran', 'supprimee', 'planning', $2)`, [CO, uid]) === '42501', `${who} : n’écrit pas de trace (42501)`);
  check(await err(`UPDATE public.traces SET action = 'remise' WHERE id = $1`, [anyId]) === '42501', `${who} : ne modifie pas une trace (42501)`);
  check(await err(`DELETE FROM public.traces WHERE id = $1`, [anyId]) === '42501', `${who} : n’efface pas une trace (42501)`);
  check(await err(`TRUNCATE public.traces`) === '42501', `${who} : ne vide pas la table (42501)`);
}
await as('', 'service_role');
check(await err(`DELETE FROM public.traces WHERE id = $1`, [anyId]) === '42501' && await err(`UPDATE public.traces SET action = 'remise'`) === '42501',
  'le service (fonctions edge) non plus : lecture seule');
await as(SAM);
check(await err(`SELECT * FROM public.traces_classify('planning', 'DELETE', '{}'::jsonb, NULL, NULL)`) === '42501'
  && await err(`SELECT public.traces_origin()`) === '42501' && await err(`SELECT * FROM public.traces_author()`) === '42501', 'les fonctions des traces ne s’appellent pas à la main (42501)');
await root();
check(await count(`SELECT count(*) n FROM public.traces WHERE id = $1`, [anyId]) === 1, 'la trace visée est toujours là');

// ═══ Jamais bloquant ═══════════════════════════════════════════════════════
section('Une erreur de trace ne bloque jamais l’action');
await root();
// Test seulement : on rend TOUTE écriture de trace impossible.
await db.exec(`ALTER TABLE public.traces ADD CONSTRAINT test_refuse_tout CHECK (false) NOT VALID`);
const P9 = await slot({ date: d(9) });
const nB = await nTraces();
await as(ADMIN);
const e9 = await err(`DELETE FROM public.planning WHERE id = $1`, [P9.id]);
await root();
check(!e9 && await count(`SELECT count(*) n FROM public.planning WHERE id = $1`, [P9.id]) === 0, 'trace impossible : la case est QUAND MÊME supprimée');
check(await nTraces() === nB, '… et rien n’est écrit à moitié (avertissement dans les journaux de la base)');
await startSession(ALEX, '2 hours');
await as(ADMIN);
check(!(await err(`DELETE FROM public.active_sessions WHERE user_id = $1`, [ALEX])), 'trace impossible : le chrono est quand même supprimé');
await as(ADMIN);
const M3 = await one(`SELECT * FROM public.office_save_meeting(NULL, 'Réunion', $1, '10:00', NULL, NULL, false, $2::uuid[])`, [d(18), `{${SAM}}`]);
check(!(await err(`SELECT * FROM public.office_save_meeting($1, 'Réunion', $2, '11:00', NULL, NULL, false, $3::uuid[])`, [M3.id, d(18), `{${SAM}}`])), 'trace impossible : la réunion est quand même décalée');
check(!(await err(`SELECT public.office_delete_meeting($1)`, [M3.id])), 'trace impossible : la réunion est quand même retirée (déclencheur BEFORE : il rend la ligne)');
await root();
check(await count(`SELECT count(*) n FROM public.meetings WHERE id = $1`, [M3.id]) === 0, '… elle est bien partie');
await db.exec(`ALTER TABLE public.traces DROP CONSTRAINT test_refuse_tout`);

// ═══ Performance ═══════════════════════════════════════════════════════════
section('Performance raisonnable');
await root();
await db.query(`INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, created_by, created_at)
  SELECT $1, $2, $3, $4::date + (g % 25), $5, now() - interval '1 day' FROM generate_series(1, 2000) g`, [CO, CHEF, WS, d(0), ADMIN]);
await as(ADMIN);
let t0 = performance.now();
await db.query(`UPDATE public.planning SET estimated_start = '07:00' WHERE user_id = $1`, [CHEF]);
const tUpd = performance.now() - t0;
t0 = performance.now();
await db.query(`DELETE FROM public.planning WHERE user_id = $1`, [CHEF]);
const tDel = performance.now() - t0;
await root();
check(await count(`SELECT count(*) n FROM public.traces WHERE user_id = $1 AND object_table = 'planning'`, [CHEF]) === 4000, '2000 cases décalées puis supprimées : 4000 traces');
check(tUpd < 4000 && tDel < 4000, `2000 cases : décaler ${Math.round(tUpd)} ms, supprimer ${Math.round(tDel)} ms (PGlite, WebAssembly — bien plus lent qu’un vrai serveur)`);
// Le cas fréquent : un salarié tape ses heures, une ligne à la fois.
const E9 = await entry({ date: d(14) });
const typeHours = async () => {
  await as(SAM);
  const s = performance.now();
  for (let i = 0; i < 200; i++) await db.query(`UPDATE public.time_entries SET end_time = $2 WHERE id = $1`, [E9.id, i % 2 ? '12:00' : '12:15']);
  return performance.now() - s;
};
const withT = await typeHours();
await root();
await db.exec(`ALTER TABLE public.time_entries DISABLE TRIGGER traces_heures_changee`);
const withoutT = await typeHours();
await root();
await db.exec(`ALTER TABLE public.time_entries ENABLE TRIGGER traces_heures_changee`);
check(withT < withoutT * 3 + 200, `200 saisies d’heures une à une : ${Math.round(withT)} ms avec les traces, ${Math.round(withoutT)} ms sans`);
const plan = (await rows(`EXPLAIN SELECT * FROM public.traces WHERE company_id = '${CO}' ORDER BY created_at DESC LIMIT 50`)).map((x) => x['QUERY PLAN']).join(' ');
check(/traces_company_date_idx/.test(plan), 'lecture du bureau : par l’index entreprise / date');
const plan2 = (await rows(`EXPLAIN SELECT * FROM public.traces WHERE user_id = '${SAM}' AND created_at > now() - interval '60 days' ORDER BY created_at DESC`)).map((x) => x['QUERY PLAN']).join(' ');
check(/traces_user_date_idx/.test(plan2), 'lecture du salarié : par l’index salarié / date');

// ═══ Retour arrière ════════════════════════════════════════════════════════
section('Retour arrière (bloc du fichier, décommenté), puis la migration se rejoue');
await root();
const kept = await nTraces();
{ const e = await errExec(ROLLBACK_SQL); check(!e, `le retour arrière s’exécute sans erreur${e ? ` (${e})` : ''}`); }
const gone = await one(`SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)) AS f,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'traces\\_%') AS t`, [NEW_FNS]);
check(Number(gone.f) === 0 && Number(gone.t) === 0, 'fonctions et déclencheurs du lot retirés');
check(await nTraces() === kept, `les traces déjà écrites sont GARDÉES (${kept})`);
const back2 = await prints();
check(back2.fn === before.fn && back2.pol === before.pol && back2.trg === before.trg && back2.col === before.col && back2.priv === before.priv,
  'après retour arrière : fonctions, policies, triggers, colonnes et droits existants identiques à avant la migration');
const P10 = await slot({ date: d(4) });
await as(ADMIN);
await db.query(`DELETE FROM public.planning WHERE id = $1`, [P10.id]);
check(await nTraces() === kept, 'après retour arrière : plus aucune trace écrite, l’appli marche comme avant');
await root();
check(!(await errExec(SQL)), 'la migration se recharge après le retour arrière');
check(Object.values(await one(POST_SQL)).every((x) => x === true), 'vérification après application : de nouveau toute à true');
check(await nTraces() === kept, 'recharger ne touche pas aux traces existantes');
// Le retrait COMPLET (ligne à part, hors du bloc) : la table aussi, puis rechargement.
await errExec(ROLLBACK_SQL);
check(!(await errExec('DROP TABLE IF EXISTS public.traces;')) && !(await errExec(SQL)), 'retrait complet (table comprise) puis rechargement : sans erreur');
check(Object.values(await one(POST_SQL)).every((x) => x === true), 'vérification après application : toute à true');

console.log(`\n${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
