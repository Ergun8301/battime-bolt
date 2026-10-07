// Lot 14 — chef d'équipe : toute l'équipe, 7 derniers jours. Rejoué POUR DE VRAI
// sur un Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:chef-equipe
//
// Même bouchon que les tests des lots 11 et 12 (fonctions et policies de
// PRODUCTION recopiées mot pour mot), plus is_lead, correct_time_entry et le
// journal des corrections tels qu'en production (lus le 06/10/2026). Les
// migrations des lots 9, 11, 12 et 14 sont chargées TELLES QUELLES.
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
const CHEF = '30000000-0000-0000-0000-000000000003';
const LUCAS = '10000000-0000-0000-0000-000000000001';
const NINA = '20000000-0000-0000-0000-000000000002';
const CHEF2 = '50000000-0000-0000-0000-000000000005'; // un autre chef, même entreprise
const ANCIEN = '60000000-0000-0000-0000-000000000006'; // salarié archivé
const OTHER_CHEF = 'b0000000-0000-0000-0000-00000000000b';
const WS = 'e0000000-0000-0000-0000-000000000001';
const WS2 = 'e0000000-0000-0000-0000-000000000002';

const EXTRA = `
ALTER TABLE public.companies ADD COLUMN kiosk_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.time_entries ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
CREATE TABLE public.kiosks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, revoked_at timestamptz);
CREATE TABLE public.planning (id uuid PRIMARY KEY, user_id uuid, work_date date, estimated_end time);
GRANT ALL ON public.kiosks, public.planning TO service_role;

-- is_lead, de PRODUCTION.
CREATE FUNCTION public.is_lead() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'lead' AND is_active IS DISTINCT FROM false) $$;
-- La VRAIE règle d'avant (production), à la place du bouchon du lot 11 : la migration la remplace.
CREATE OR REPLACE FUNCTION public.is_my_team_member(p_user uuid, p_date date)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
  SELECT public.is_lead() AND p_user IS NOT NULL AND p_date = (now() AT TIME ZONE 'Europe/Paris')::date
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.company_id = public.get_my_company_id())
     AND EXISTS (SELECT 1 FROM (
           SELECT t.worksite_id FROM public.time_entries t WHERE t.user_id = auth.uid() AND t.work_date = p_date AND t.status <> 'cancelled'
         ) AS mine JOIN (
           SELECT t.worksite_id FROM public.time_entries t WHERE t.user_id = p_user AND t.work_date = p_date AND t.status <> 'cancelled'
         ) AS theirs ON theirs.worksite_id = mine.worksite_id);
$f$;

-- Journal des corrections + correct_time_entry, de PRODUCTION.
CREATE TABLE public.time_entry_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, entry_id uuid NOT NULL, worker_id uuid NOT NULL,
  work_date date NOT NULL, corrected_by uuid NOT NULL, corrected_by_role text NOT NULL, corrected_at timestamptz NOT NULL DEFAULT now(),
  old_start time NOT NULL, old_end time NOT NULL, new_start time NOT NULL, new_end time NOT NULL, was_exported boolean NOT NULL,
  notified_at timestamptz, notify_error text);
ALTER TABLE public.time_entry_corrections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.time_entry_corrections TO authenticated;
CREATE POLICY time_entry_corrections_insert ON public.time_entry_corrections FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_my_company_id()) AND (corrected_by = auth.uid()) AND (is_admin() OR is_my_team_member(worker_id, work_date)));
CREATE POLICY time_entry_corrections_select ON public.time_entry_corrections FOR SELECT TO authenticated
  USING ((company_id = get_my_company_id()) AND (is_admin() OR (worker_id = auth.uid()) OR (corrected_by = auth.uid())));
CREATE FUNCTION public.correct_time_entry(p_entry_id uuid, p_start time, p_end time)
 RETURNS TABLE(correction_id uuid, worker_id uuid, work_date date, old_start time, old_end time, new_start time, new_end time, corrected_by_role text)
 LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE e record; v_role text; v_id uuid;
BEGIN
  SELECT t.id, t.user_id, t.company_id, t.work_date, t.start_time, t.end_time, t.exported_at INTO e FROM public.time_entries t WHERE t.id = p_entry_id;
  IF e IS NULL THEN RAISE EXCEPTION 'Cette ligne n''existe pas, ou vous n''y avez pas accès.'; END IF;
  IF (e.start_time, e.end_time) IS NOT DISTINCT FROM (p_start, p_end) THEN RAISE EXCEPTION 'Ces heures sont déjà celles-là.'; END IF;
  IF e.user_id = auth.uid() THEN RAISE EXCEPTION 'Ce chemin sert à corriger les heures de quelqu''un d''autre.'; END IF;
  v_role := CASE WHEN public.is_admin() THEN 'admin' WHEN public.is_my_team_member(e.user_id, e.work_date) THEN 'lead' ELSE NULL END;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Vous n''avez pas le droit de corriger les heures de cette personne.'; END IF;
  UPDATE public.time_entries SET start_time = p_start, end_time = p_end WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cette ligne n''a pas pu être corrigée.'; END IF;
  INSERT INTO public.time_entry_corrections (company_id, entry_id, worker_id, work_date, corrected_by, corrected_by_role, old_start, old_end, new_start, new_end, was_exported)
  VALUES (e.company_id, e.id, e.user_id, e.work_date, auth.uid(), v_role, e.start_time, e.end_time, p_start, p_end, e.exported_at IS NOT NULL) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, e.user_id, e.work_date, e.start_time, e.end_time, p_start, p_end, v_role;
END; $function$;
GRANT EXECUTE ON FUNCTION public.correct_time_entry(uuid, time, time) TO authenticated;

INSERT INTO public.companies (id) VALUES ('${CO}'), ('${CO2}');
INSERT INTO public.users VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Paul', 'Martin'),
  ('${CHEF}', '${CO}', 'lead', true, 'Marc', 'Chef'),
  ('${CHEF2}', '${CO}', 'lead', true, 'Ali', 'Chef'),
  ('${LUCAS}', '${CO}', 'worker', true, 'Lucas', 'Petit'),
  ('${NINA}', '${CO}', 'worker', true, 'Nina', 'Roux'),
  ('${ANCIEN}', '${CO}', 'worker', false, 'Ancien', 'Salarié'),
  ('${OTHER_CHEF}', '${CO2}', 'lead', true, 'Autre', 'Chef');
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

const EXISTING_FN = ['get_my_company_id', 'is_admin', 'is_lead', 'is_month_closed', 'guard_time_entry_write', 'guard_time_entry_delete',
  'guard_active_session', 'mark_reserve_fixed', 'finish_active_session', 'user_closed_until', 'correct_time_entry', 'guard_time_entry_qr'];
const fnPrint = async () => (await db.query(`SELECT string_agg(proname || ':' || md5(pg_get_functiondef(oid)), ',' ORDER BY proname) AS s
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`, [EXISTING_FN])).rows[0].s;
const polPrint = async () => (await db.query(`SELECT string_agg(tablename || '.' || policyname || ':' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')), ',' ORDER BY tablename, policyname) AS s FROM pg_policies`)).rows[0].s;
const trgPrint = async () => (await db.query(`SELECT string_agg(tgname || ':' || md5(pg_get_triggerdef(oid)), ',' ORDER BY tgname) AS s
  FROM pg_trigger WHERE NOT tgisinternal AND tgname <> 'time_entries_lead_guard'`)).rows[0].s;
const before = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint() };
const SQL14 = mig('20261006120000_lot14_chef_equipe_7_jours.sql');
await db.exec(SQL14);
await db.exec(SQL14);
const after = { fn: await fnPrint(), pol: await polPrint(), trg: await trgPrint() };
check(before.fn === after.fn, 'fonctions existantes inchangées (sauf is_my_team_member, remplacée comme demandé)');
check(before.pol === after.pol, 'policies RLS inchangées');
check(before.trg === after.trg, 'triggers existants inchangés');
check(!/\b(DROP\s+(TABLE|COLUMN|POLICY)|RENAME|ALTER\s+COLUMN|ALTER\s+POLICY|DELETE\s+FROM)\b/i.test(SQL14.split('-- RETOUR ARRIÈRE')[0]), 'migration additive (hors is_my_team_member) et rejouable');

const days = (await db.query(`SELECT ((now() AT TIME ZONE 'Europe/Paris')::date)::text AS j0,
  ((now() AT TIME ZONE 'Europe/Paris')::date - 1)::text AS j1, ((now() AT TIME ZONE 'Europe/Paris')::date - 6)::text AS j6,
  ((now() AT TIME ZONE 'Europe/Paris')::date - 7)::text AS j7, ((now() AT TIME ZONE 'Europe/Paris')::date - 3)::text AS j3,
  ((now() AT TIME ZONE 'Europe/Paris')::date + 1)::text AS demain`)).rows[0];
const { j0, j1, j3, j6, j7, demain } = days;

const as = async (uid) => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); if (uid) await db.exec(`SET ROLE authenticated`); };
const run = async (sql, params = []) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } };
const refused = async (sql, params, needle, label) => {
  const r = await run(sql, params);
  const good = !r.ok && (needle instanceof RegExp ? needle.test(r.err) : r.err.includes(needle));
  check(good, `${label}${r.ok ? ' — ACCEPTÉ à tort' : good ? ` (« ${r.err} »)` : ` — refus inattendu : « ${r.err} »`}`);
};
const accepted = async (sql, params, label) => { const r = await run(sql, params); check(r.ok, `${label}${r.ok ? '' : ` — refusé : « ${r.err} »`}`); return r; };
// Écritures et lectures « système » : superutilisateur ET auth.uid() nul (sinon les gardes
// verraient le dernier utilisateur simulé comme auteur).
const one = async (sql, params = []) => { await db.exec(`RESET ROLE`); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); return (await db.query(sql, params)).rows[0]; };
const INS = `INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status)
  VALUES ($1, $2, $3, $4::date, $5::time, $6::time, 'draft') RETURNING id`;

// ═══ Le chef saisit la VEILLE, sans être sur le chantier ═══════════════════
await as(CHEF);
let r = await accepted(INS, [CO, LUCAS, WS, j1, '08:00', '17:00'], 'chef : saisit HIER pour Lucas, sans être lui-même sur ce chantier');
const eLucas = r.rows?.[0]?.id;
let row = await one(`SELECT lead_edited_by, lead_edited_at, status FROM public.time_entries WHERE id = $1`, [eLucas]);
check(row.lead_edited_by === CHEF && row.lead_edited_at && row.status === 'draft', 'trace « par le chef d’équipe » posée, ligne en brouillon (Lucas l’enverra)');
await as(CHEF);
await accepted(INS, [CO, NINA, WS2, j6, '07:30', '12:00'], 'chef : saisit il y a 6 jours (limite incluse)');
await accepted(INS, [CO, CHEF2, WS, j0, '08:00', '12:00'], 'chef : saisit pour un autre chef d’équipe');
await refused(INS, [CO, LUCAS, WS, j7, '08:00', '17:00'], 'row-level security', 'chef : il y a 7 jours → refusé');
await refused(INS, [CO, LUCAS, WS, demain, '08:00', '17:00'], 'row-level security', 'chef : demain → refusé');
await refused(INS, [CO, ADMIN, WS, j0, '08:00', '17:00'], 'row-level security', 'chef : heures d’un compte Bureau → refusé');
await refused(INS, [CO, ANCIEN, WS, j0, '08:00', '17:00'], 'row-level security', 'chef : salarié archivé → refusé');
await as(OTHER_CHEF);
await refused(INS, [CO, LUCAS, WS, j0, '08:00', '17:00'], 'row-level security', 'chef d’une autre entreprise → refusé');

// ═══ Déjà une ligne ce jour-là sur ce chantier : on corrige, pas de doublon ═
await as(LUCAS);
const own = (await accepted(INS, [CO, LUCAS, WS, j3, '08:00', '16:00'], 'Lucas saisit lui-même sa journée (comme avant)')).rows?.[0]?.id;
check((await one(`SELECT lead_edited_by FROM public.time_entries WHERE id = $1`, [own])).lead_edited_by === null, '… sans trace de chef');
await as(CHEF);
await refused(INS, [CO, LUCAS, WS, j3, '08:00', '17:00'], 'déjà une ligne', 'chef : 2e ligne même jour / même chantier → refusée (« corrigez-la »)');
await accepted(`UPDATE public.time_entries SET end_time = '17:00' WHERE id = $1`, [own], 'chef : corrige la ligne existante de Lucas');
row = await one(`SELECT end_time::text AS e, lead_edited_by, status FROM public.time_entries WHERE id = $1`, [own]);
check(row.e === '17:00:00' && row.lead_edited_by === CHEF && row.status === 'draft', 'ligne corrigée, trace « par le chef d’équipe », toujours à Lucas d’envoyer');
await accepted(INS, [CO, LUCAS, WS2, j3, '17:00', '18:00'], 'chef : même jour, AUTRE chantier → nouvelle ligne permise');

// ═══ Le salarié garde la main sur sa ligne, la trace reste ════════════════
await as(LUCAS);
await accepted(`UPDATE public.time_entries SET break_minutes = 30, lead_edited_by = NULL WHERE id = $1`, [own], 'Lucas ajoute sa pause (et tente d’effacer la trace)');
check((await one(`SELECT lead_edited_by FROM public.time_entries WHERE id = $1`, [own])).lead_edited_by === CHEF, '… la trace du chef reste');
await as(LUCAS);
await accepted(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [own], 'Lucas envoie sa journée (comme avant)');
await as(LUCAS);
await accepted(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status, lead_edited_by)
  VALUES ($1, $2, $3, $4::date, '06:00', '07:00', 'draft', $5)`, [CO, LUCAS, WS2, j0, CHEF], 'Lucas insère une ligne en se faisant passer pour le chef');
check((await one(`SELECT lead_edited_by FROM public.time_entries WHERE user_id = $1 AND start_time = '06:00'`, [LUCAS])).lead_edited_by === null, '… la trace n’est pas posée');
await as(LUCAS);
await refused(INS, [CO, NINA, WS, j0, '08:00', '17:00'], 'row-level security', 'Lucas (salarié) ne saisit pas pour Nina');

// ═══ Jamais : envoyer à la place, ligne validée / verrouillée, mois ou salarié clôturé ═
await as(CHEF);
await accepted(`UPDATE public.time_entries SET status = 'submitted' WHERE id = $1`, [eLucas], 'chef : tente d’envoyer la journée de Lucas');
check((await one(`SELECT status FROM public.time_entries WHERE id = $1`, [eLucas])).status === 'draft', '… refusé en silence : la ligne reste « à envoyer »');
const val = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '08:00', '12:00', 'validated') RETURNING id`, [CO, NINA, WS, j1])).id;
const lock = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status, locked) VALUES ($1, $2, $3, $4::date, '13:00', '17:00', 'submitted', true) RETURNING id`, [CO, NINA, WS2, j1])).id;
await as(CHEF);
r = await run(`UPDATE public.time_entries SET end_time = '13:00' WHERE id = $1 RETURNING id`, [val]);
check(r.ok && r.rows.length === 0 && (await one(`SELECT end_time::text AS e FROM public.time_entries WHERE id = $1`, [val])).e === '12:00:00', 'journée VALIDÉE : le chef ne la touche pas');
await as(CHEF);
r = await run(`UPDATE public.time_entries SET end_time = '18:00' WHERE id = $1 RETURNING id`, [lock]);
check(r.ok && r.rows.length === 0, 'ligne VERROUILLÉE (chez le comptable) : le chef ne la touche pas');
await one(`INSERT INTO public.user_closures (user_id, company_id, closed_until, closed_by) VALUES ($1, $2, $3::date, $4)`, [NINA, CO, j1, ADMIN]);
await as(CHEF);
await refused(INS, [CO, NINA, WS2, j1, '18:00', '19:00'], /cl[ôo]tur/, 'salarié CLÔTURÉ : le chef ne saisit pas');
await one(`INSERT INTO public.month_closures (company_id, month) VALUES ($1, date_trunc('month', $2::date)::date)`, [CO2, j1]);
await as(CHEF);
await accepted(INS, [CO, LUCAS, WS, j0, '08:00', '09:00'], 'mois d’une autre entreprise clôturé : sans effet ici');

// ═══ Correction d'une ligne ENVOYÉE (journal + salarié prévenu) ═══════════
const sent = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '08:00', '16:00', 'submitted') RETURNING id`, [CO, LUCAS, WS, j6])).id;
await as(CHEF);
r = await accepted(`SELECT * FROM public.correct_time_entry($1, '08:00', '17:00')`, [sent], 'chef : corrige une journée ENVOYÉE il y a 6 jours, sans être sur le chantier');
check(r.rows?.[0]?.corrected_by_role === 'lead', 'journal des corrections : « par le chef d’équipe »');
row = await one(`SELECT lead_edited_by, modified_by FROM public.time_entries WHERE id = $1`, [sent]);
check(row.lead_edited_by === CHEF && row.modified_by === CHEF, 'trace posée + « modifié après envoi » pour le bureau');

// ═══ Ce que le chef voit ══════════════════════════════════════════════════
await as(CHEF);
const seen = (await run(`SELECT user_id, work_date::text AS d FROM public.time_entries`)).rows || [];
check(seen.some((x) => x.user_id === LUCAS && x.d === j3) && seen.some((x) => x.user_id === NINA && x.d === j1), 'le chef VOIT les heures de l’équipe sur 7 jours (pour corriger)');
check(!seen.some((x) => x.user_id === ADMIN), '… jamais celles du bureau');
await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '08:00', '12:00', 'submitted')`, [CO, NINA, WS, j7]);
await as(CHEF);
check(!((await run(`SELECT 1 FROM public.time_entries WHERE user_id = $1 AND work_date = $2::date`, [NINA, j7])).rows || []).length, '… ni au-delà de 7 jours');

// ═══ CORRECTIF : le chef ENVOIE (salarié qui n'ouvre jamais l'appli) ════
const SEND = `SELECT public.lead_send_entries($1::uuid[]) AS n`;
const MONTH_EXPORT = `SELECT id FROM public.time_entries WHERE company_id = $1 AND status IN ('submitted','validated')
  AND work_date >= date_trunc('month', $2::date)::date AND work_date <= $2::date`;
await as(CHEF);
const jamais = (await accepted(INS, [CO, CHEF2, WS2, j1, '07:00', '15:00'], 'chef : saisit la journée d’Ali (il n’ouvre jamais l’appli)')).rows?.[0]?.id;
r = await accepted(SEND, [[jamais]], 'chef : « OK » → envoyée au bureau');
check(r.rows?.[0]?.n === 1, '… 1 ligne envoyée');
row = await one(`SELECT status, submitted_at, lead_edited_by FROM public.time_entries WHERE id = $1`, [jamais]);
check(row.status === 'submitted' && row.submitted_at && row.lead_edited_by === CHEF, 'arrive chez le patron comme une journée ENVOYÉE, badge « par le chef d’équipe »');
const exp = (await one(`SELECT array_agg(id::text) AS ids FROM (${MONTH_EXPORT}) x`, [CO, j1])).ids || [];
check(exp.includes(jamais), 'la journée entre dans l’export du mois (statut envoyé)');
// Le salarié qui utilise l'appli garde la main, le patron voit « modifié après envoi ».
await as(CHEF2);
await accepted(`UPDATE public.time_entries SET end_time = '15:30' WHERE id = $1`, [jamais], 'Ali corrige lui-même sa journée envoyée par le chef');
row = await one(`SELECT status, modified_at, modified_by FROM public.time_entries WHERE id = $1`, [jamais]);
check(row.status === 'submitted' && row.modified_at && row.modified_by === CHEF2, '… toujours envoyée, « modifié après envoi » côté patron');
// Une ligne saisie par le salarié lui-même, en brouillon : le chef peut l'envoyer.
await as(LUCAS);
const brouillon = (await accepted(INS, [CO, LUCAS, WS2, j1, '13:00', '16:00'], 'Lucas a noté une ligne sans l’envoyer')).rows?.[0]?.id;
await as(CHEF);
await accepted(SEND, [[brouillon]], 'chef : l’envoie pour lui');
row = await one(`SELECT status, lead_edited_by FROM public.time_entries WHERE id = $1`, [brouillon]);
check(row.status === 'submitted' && row.lead_edited_by === CHEF, '… envoyée, badge « par le chef d’équipe »');
// Limites inchangées.
await as(CHEF);
r = await accepted(SEND, [[val, lock]], 'chef : envoie une journée validée et une verrouillée');
check(r.rows?.[0]?.n === 0 && (await one(`SELECT status FROM public.time_entries WHERE id = $1`, [val])).status === 'validated', '… rien ne bouge (0 envoyée)');
const vieux = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '08:00', '12:00', 'draft') RETURNING id`, [CO, LUCAS, WS, j7])).id;
await as(CHEF);
await refused(SEND, [[vieux]], 'pas dans votre équipe', 'chef : envoyer une ligne d’il y a 7 jours → refusé');
const bureau = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '08:00', '12:00', 'draft') RETURNING id`, [CO, ADMIN, WS, j0])).id;
await as(CHEF);
await refused(SEND, [[bureau]], 'pas dans votre équipe', 'chef : envoyer les heures d’un compte Bureau → refusé');
const closedDay = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status) VALUES ($1, $2, $3, $4::date, '06:00', '07:00', 'draft') RETURNING id`, [CO, NINA, WS2, j1])).id;
await as(CHEF);
await refused(SEND, [[closedDay]], /cl[ôo]tur/, 'chef : envoyer pour un salarié clôturé → refusé (garde du salarié)');
const incompl = (await one(`INSERT INTO public.time_entries (company_id, user_id, worksite_id, work_date, start_time, end_time, status, exit_forgotten) VALUES ($1, $2, $3, $4::date, '08:00', '08:00', 'draft', true) RETURNING id`, [CO, LUCAS, WS2, j3])).id;
await as(CHEF);
await refused(SEND, [[incompl]], 'indiquez l', 'chef : envoyer une sortie oubliée « à compléter » → refusé (lot 12)');
await as(LUCAS);
await refused(SEND, [[brouillon]], 'Réservé au chef', 'un salarié ne peut pas appeler l’envoi du chef');

console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
