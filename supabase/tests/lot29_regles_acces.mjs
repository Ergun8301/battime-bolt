// Lot 29 — 33 règles d'accès réécrites avec (SELECT …) + 4 index. PREUVE D'ÉQUIVALENCE,
// rejouée sur un Postgres jetable (PGlite). Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:regles-acces        (à lancer SEUL : ~2 min, 4 cœurs partagés)
//
// Ce que ce test fait, dans l'ordre :
//  1. RÉGÉNÈRE le fichier de migration à partir de l'export de production
//     (supabase/tests/fixtures/policies-prod-2026-10-13.txt, seule copie du texte d'« avant »)
//     et exige l'égalité EXACTE avec supabase/migrations/20261013120000_lot29_regles_acces_index.sql.
//  2. Vérifie le fichier : en-tête à 3 blocs, horodatage, aucune instruction de suppression.
//  3. Monte un schéma minimal fidèle, crée les 33 règles « avant » depuis l'export, joue des
//     dizaines de milliers de sondes (SELECT / INSERT / UPDATE / DELETE par acteur, table, ligne),
//     applique la migration, rejoue les mêmes sondes : 0 différence exigée.
//  4. Prouve que la comparaison SAIT voir une différence (3 mutations appliquées à la main).
//  5. Rejeu de la migration (2e passage sans effet) et garde (une règle modifiée => refus avec son nom).
//  6. Exécute la requête de vérification de l'en-tête : 9 × true après, faux sur v4/v5/v8 avant.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, 'fixtures', 'policies-prod-2026-10-13.txt');
const VERSION = '20261013120000', NAME = 'lot29_regles_acces_index';
const MIG_FILE = path.join(here, '..', 'migrations', `${VERSION}_${NAME}.sql`);

const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';
let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}

let fails = 0;
const ok = (cond, label, detail) => {
  if (cond) console.log(`ok — ${label}`);
  else { fails++; console.log(`ÉCHEC — ${label}${detail !== undefined ? ' : ' + JSON.stringify(detail) : ''}`); }
};

// ───────────────────────────── 1. Générateur (source unique du texte de production) ─────────────────────────────
function parse(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const m = /^(\w+) \| (\w+) \| (SELECT|INSERT|UPDATE|DELETE|ALL) \| (\w+) \| (.*)$/.exec(line);
    if (!m) throw new Error('ligne illisible: ' + line);
    let [, table, name, cmd, roles, rest] = m;
    let using = null, check = null;
    const iCheck = rest.indexOf(' | CHECK ');
    if (iCheck >= 0) { check = rest.slice(iCheck + 9); rest = rest.slice(0, iCheck); }
    else if (rest.startsWith('CHECK ')) { check = rest.slice(6); rest = ''; }
    if (rest.startsWith('USING ')) using = rest.slice(6);
    out.push({ table, name, cmd, roles, using, check });
  }
  return out;
}
const RE = /(?<![\w.])(auth\.uid|get_my_company_id|is_admin)\(\)/g;
// Les littéraux '…' restent intouchés ; is_my_team_member n'est pas dans la liste (dépend de la ligne).
function wrap(expr) {
  return expr.split(/('(?:[^']|'')*')/).map((p, i) => i % 2 ? p : p.replace(RE, (m0, f, off, s) => /SELECT $/.test(s.slice(0, off)) ? m0 : `(SELECT ${f}())`)).join('');
}
const unwrap = (expr) => expr.replace(/\(SELECT (auth\.uid|get_my_company_id|is_admin)\(\)\)/g, '$1()');

const CMD = { SELECT: 'r', INSERT: 'a', UPDATE: 'w', DELETE: 'd', ALL: '*' };
const INDEXES = [
  ['planning_company_date_idx', 'planning', 'company_id, work_date'],
  ['time_entries_company_date_idx', 'time_entries', 'company_id, work_date'],
  ['worksite_expenses_worksite_idx', 'worksite_expenses', 'worksite_id'],
  ['active_sessions_planning_idx', 'active_sessions', 'planning_id'],
];
const pols = parse(fs.readFileSync(FIXTURE, 'utf8'));

const LOOKUP = (phase) => `
  FOR e IN SELECT * FROM jsonb_array_elements(v_exp) LOOP
    SELECT p.polcmd::text AS cmd, pp.roles::text AS roles, pp.qual, pp.with_check INTO c
      FROM pg_policy p JOIN pg_class k ON k.oid = p.polrelid JOIN pg_namespace n ON n.oid = k.relnamespace
      JOIN pg_policies pp ON pp.schemaname = n.nspname AND pp.tablename = k.relname AND pp.policyname = p.polname
     WHERE n.nspname = 'public' AND k.relname = e->>'t' AND p.polname = e->>'p' AND p.polpermissive;
    IF NOT FOUND THEN RAISE EXCEPTION 'lot29 (${phase}) : règle % introuvable sur %', e->>'p', e->>'t'; END IF;
    IF c.cmd <> e->>'c' OR c.roles <> '{' || (e->>'r') || '}'
       OR regexp_replace(regexp_replace(c.qual, v_wrap, '\\1', 'g'), '\\s+', ' ', 'g')
          IS DISTINCT FROM regexp_replace(e->>'q', '\\s+', ' ', 'g')
       OR regexp_replace(regexp_replace(c.with_check, v_wrap, '\\1', 'g'), '\\s+', ' ', 'g')
          IS DISTINCT FROM regexp_replace(e->>'w', '\\s+', ' ', 'g') THEN
      RAISE EXCEPTION 'lot29 (${phase}) : la règle % de % n''a pas la définition attendue (commande, rôles ou texte)', e->>'p', e->>'t';
    END IF;${phase === 'après' ? `
    -- plus aucun appel « nu », et autant d'appels entourés que de nus avant
    IF regexp_replace(coalesce(c.qual, '') || ' ' || coalesce(c.with_check, ''), v_wrap, '', 'g') ~ v_nue THEN
      RAISE EXCEPTION 'lot29 (après) : il reste un appel nu dans %', e->>'p';
    END IF;
    SELECT count(*) INTO v_n FROM regexp_matches(coalesce(c.qual, '') || ' ' || coalesce(c.with_check, ''), v_wrap, 'g');
    IF v_n <> (SELECT count(*) FROM regexp_matches(coalesce(e->>'q', '') || ' ' || coalesce(e->>'w', ''), v_nue, 'g')) THEN
      RAISE EXCEPTION 'lot29 (après) : nombre d''appels entourés inattendu dans % (%)', e->>'p', v_n;
    END IF;` : ''}
  END LOOP;`;

function alterOf(p, u, w) {
  const parts = [];
  if (u) parts.push(`USING ${u}`);
  if (w) parts.push(`WITH CHECK ${w}`);
  return `ALTER POLICY ${p.name} ON public.${p.table}\n    ${parts.join('\n    ')};`;
}

function buildBloc() {
  const exp = pols.map((p) => ({ t: p.table, p: p.name, c: CMD[p.cmd], r: p.roles, q: p.using, w: p.check }));
  const alters = pols.map((p) => '  ' + alterOf(p, p.using ? wrap(p.using) : null, p.check ? wrap(p.check) : null)).join('\n');
  const json = exp.map((o) => '    ' + JSON.stringify(o)).join(',\n');
  const idx = INDEXES.map(([n, t, c]) => `  CREATE INDEX IF NOT EXISTS ${n} ON public.${t} (${c});`).join('\n');
  return `DO $mig$
DECLARE
  v_exp   jsonb := $j$[
${json}
  ]$j$;
  v_wrap  constant text := '\\( SELECT (auth\\.uid\\(\\)|get_my_company_id\\(\\)|is_admin\\(\\)) AS [a-z_]+\\)';
  v_nue   constant text := '(auth\\.uid|get_my_company_id|is_admin)\\(\\)';
  e       jsonb;
  c       record;
  v_n     int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'pg_catalog, public', true);
  -- 1) GARDE-FOU AVANT
${LOOKUP('avant')}

  -- 2) LES RÈGLES
${alters}

  -- 3) LES INDEX
${idx}

  -- 4) CONTRÔLE APRÈS (annule tout en cas d'écart)
${LOOKUP('après')}
END
$mig$;
`;
}

const commente = (s) => s.split('\n').map((l) => ('--' + (l ? '   ' + l : ''))).join('\n');
const norm = (x) => (x ?? '').replace(/\s+/g, ' ').trim();
const aggregat = pols.slice().sort((a, b) => (a.table + a.name < b.table + b.name ? -1 : 1))
  .map((p) => [p.table, p.name, p.cmd, '{' + p.roles + '}', norm(p.using), norm(p.check)].join('|')).join('\n');
const MD5 = crypto.createHash('md5').update(aggregat).digest('hex');

function buildEntete() {
  const values = pols.map((p) => `('${p.table}','${p.name}')`).join(',');
  const rollback = pols.map((p) => {
    const parts = [];
    if (p.using) parts.push(`USING ${p.using}`);
    if (p.check) parts.push(`WITH CHECK ${p.check}`);
    return `ALTER POLICY ${p.name} ON public.${p.table}\n  ${parts.join('\n  ')};`;
  }).join('\n');
  const noms = INDEXES.map((i) => `'${i[0]}'`).join(', ');
  const verif = `WITH p AS (
  SELECT tablename AS t, policyname AS n, cmd, roles::text AS r, permissive,
         coalesce(qual, '') AS q, coalesce(with_check, '') AS w
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (tablename, policyname) IN (VALUES ${values})
), k AS (
  SELECT '\\( SELECT (auth\\.uid\\(\\)|get_my_company_id\\(\\)|is_admin\\(\\)) AS [a-z_]+\\)'::text AS wrap,
         '(auth\\.uid|get_my_company_id|is_admin)\\(\\)'::text AS nue
)
SELECT
  (SELECT count(*) FROM p) = 33                                                   AS v1_33_regles_presentes,
  (SELECT bool_and(permissive = 'PERMISSIVE') FROM p)                             AS v2_toutes_permissives,
  (SELECT count(*) FILTER (WHERE r = '{public}') = 4 AND count(*) FILTER (WHERE r = '{authenticated}') = 29 FROM p) AS v3_roles_inchanges,
  (SELECT bool_and(regexp_replace(q || ' ' || w, k.wrap, '', 'g') !~ k.nue) FROM p, k) AS v4_aucun_appel_nu,
  (SELECT sum((SELECT count(*) FROM regexp_matches(q || ' ' || w, k.wrap, 'g'))) FROM p, k) = 96 AS v5_96_appels_entoures,
  (SELECT count(*) FROM p WHERE q || w ~ 'is_my_team_member') = 3
    AND NOT EXISTS (SELECT 1 FROM p WHERE q || w ~ '\\( SELECT (public\\.)?is_my_team_member') AS v6_is_my_team_member_nu,
  (SELECT md5(string_agg(t || '|' || n || '|' || cmd || '|' || r || '|'
          || btrim(regexp_replace(regexp_replace(q, k.wrap, '\\1', 'g'), '\\s+', ' ', 'g')) || '|'
          || btrim(regexp_replace(regexp_replace(w, k.wrap, '\\1', 'g'), '\\s+', ' ', 'g')), E'\\n' ORDER BY t, n))
     FROM p, k) = '${MD5}'                                                        AS v7_texte_identique_a_l_export,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (${noms})) = 4 AS v8_4_index,
  (SELECT bool_and(i.indisvalid AND i.indisready) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname IN (${noms}))              AS v9_index_valides;`;
  return `-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 29 (oct. 2026) — SITE RAPIDE 2 : RÈGLES D'ACCÈS OPTIMISÉES + 4 INDEX
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE FAIT CE FICHIER : (1) entoure auth.uid(), get_my_company_id() et is_admin()
-- de (SELECT …) dans 33 règles d'accès (ALTER POLICY) : la base évalue alors
-- l'appel UNE fois par requête au lieu d'une fois par ligne (alerte « auth_rls_initplan »
-- de l'outil d'analyse de Supabase). Transformation purement SYNTAXIQUE : aucun droit
-- ne change (même commande, mêmes rôles, mêmes conditions). is_my_team_member(user_id,
-- work_date) n'est JAMAIS entouré (il dépend de la ligne). (2) ajoute 4 index.
-- Rien n'est supprimé. Les règles hors de cette liste (dont support_read) ne bougent pas.
--
-- AVANT D'APPLIQUER : à un moment calme (pas pendant la fermeture nocturne des pointages
-- oubliés, ni en pleine saisie) : ALTER POLICY verrouille chaque table le temps de la
-- transaction (lock_timeout 5 s : si une table est occupée, tout est annulé, on réessaie).
-- Le bloc ci-dessous est UN SEUL DO : tout passe ou rien ne passe. Il commence par
-- COMPARER chaque règle à la définition de production relevée le 13/10/2026 ; au moindre
-- écart (règle changée depuis, absente, rôle différent) il s'arrête avec le nom de la règle.
-- Il est rejouable (2e passage : rien ne change, rien n'échoue).
-- Relever AVANT (lecture seule) et garder la valeur pour la comparaison d'après :
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
--
-- RETOUR ARRIÈRE (à coller tel quel si besoin ; définitions de PRODUCTION d'avant, en clair).
-- Sans « TO » : les rôles ne changent pas. Les index ne gênent rien : les retirer est facultatif.
${commente(rollback)}
--   DROP INDEX IF EXISTS public.planning_company_date_idx;
--   DROP INDEX IF EXISTS public.time_entries_company_date_idx;
--   DROP INDEX IF EXISTS public.worksite_expenses_worksite_idx;
--   DROP INDEX IF EXISTS public.active_sessions_planning_idx;
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 9 × true :
${commente(verif)}
--   Puis : SELECT count(*) FROM pg_policies WHERE schemaname = 'public';  -- = la valeur relevée avant
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('${VERSION}', '${NAME}') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : sur le serveur, une fonction STABLE appelée « nue » dans une règle est
-- recalculée pour chaque ligne lue ; entourée de (SELECT …), elle l'est une fois.
-- Peu visible avec 13 lignes, indispensable avant de vrais clients. Les index couvrent
-- les filtres les plus fréquents (entreprise + date) et deux clés étrangères.
-- ─────────────────────────────────────────────────────────────────────────────

`;
}

// ───────────────────────────── 2. Le fichier de migration ─────────────────────────────
console.log('— le fichier de migration');
const SQL = buildEntete() + buildBloc();
ok(pols.length === 33, 'l\'export de production contient 33 règles', pols.length);
ok(fs.existsSync(MIG_FILE), 'le fichier de migration existe');
const fichier = fs.readFileSync(MIG_FILE, 'utf8');
ok(fichier === SQL, 'le fichier de migration est EXACTEMENT celui régénéré depuis l\'export de production');
ok(Number(VERSION) > 20261012100000, 'horodatage postérieur à 20261012100000');
for (const bloc of ['RETOUR ARRIÈRE', 'VÉRIFICATION', 'HISTORIQUE']) ok(fichier.includes(bloc), `en-tête : bloc « ${bloc} »`);
// aller-retour : unwrap(wrap(e)) = e, idempotent, is_my_team_member jamais entouré
let allerRetour = true, idem = true, nbEnt = 0, nbNu = 0;
for (const p of pols) for (const e of [p.using, p.check].filter(Boolean)) {
  const w = wrap(e);
  if (unwrap(w) !== e) allerRetour = false;
  if (wrap(w) !== w) idem = false;
  nbNu += (e.match(RE) || []).length;
  nbEnt += (w.match(/\(SELECT (auth\.uid|get_my_company_id|is_admin)\(\)\)/g) || []).length;
}
ok(allerRetour, 'unwrap(wrap(x)) = x sur les 33 règles');
ok(idem, 'wrap est idempotent');
ok(nbNu === 96 && nbEnt === 96, '96 appels entourés pour 96 appels nus', { nbNu, nbEnt });
ok(!/\(SELECT (public\.)?is_my_team_member/.test(fichier.replace(/^\s*--.*$/gm, '')), 'is_my_team_member n\'est jamais entouré');
// aucune suppression : après retrait des commentaires
const nettoye = fichier.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
ok(!/\b(DROP|DELETE|TRUNCATE|CASCADE)\b/i.test(nettoye) && !/ON\s+DELETE/i.test(nettoye), 'aucun DROP / DELETE / TRUNCATE / CASCADE / ON DELETE (hors commentaires)');
// 5 NOMS de règles contiennent « delete » : on les retire et plus rien ne doit rester
const sansNoms = nettoye.replace(/\b(active_sessions_delete|documents_delete|leave_requests_delete|push_subscriptions_own_delete|time_entries_worker_delete_own_draft)\b/g, '');
ok(!/delete/i.test(sansNoms), 'hors les 5 noms de règles, le mot « delete » n\'apparaît pas');
ok(!/DROP\s+POLICY/i.test(nettoye), 'aucun DROP POLICY');
ok((nettoye.match(/^\s*ALTER POLICY /gm) || []).length === 33, '33 ALTER POLICY');
ok(!/\bTO\b/.test(nettoye.replace(/'[^']*'/g, '')) , 'aucun « TO » dans les ALTER POLICY (rôles conservés)');
ok((nettoye.match(/CREATE INDEX IF NOT EXISTS/g) || []).length === 4, '4 CREATE INDEX IF NOT EXISTS');

// ───────────────────────────── 3. Schéma minimal fidèle + jeu fictif ─────────────────────────────
const A = 'c0000000-0000-0000-0000-00000000000a', B = 'c0000000-0000-0000-0000-00000000000b', S = 'c0000000-0000-0000-0000-00000000000c';
const U = { A_ADMIN: 'a0000000-0000-0000-0000-000000000001', A_ADMIN2: 'a0000000-0000-0000-0000-000000000002', A_LEAD: 'a0000000-0000-0000-0000-000000000003',
  A_W1: 'a0000000-0000-0000-0000-000000000004', A_W2: 'a0000000-0000-0000-0000-000000000005', A_OLD: 'a0000000-0000-0000-0000-000000000006',
  B_ADMIN: 'b0000000-0000-0000-0000-000000000001', B_W: 'b0000000-0000-0000-0000-000000000002', SUP: '50000000-0000-0000-0000-000000000001',
  GHOST: 'f0000000-0000-0000-0000-000000000009' };
const USERS = [[U.A_ADMIN, A, 'admin', true], [U.A_ADMIN2, A, 'admin', true], [U.A_LEAD, A, 'lead', true], [U.A_W1, A, 'worker', true],
  [U.A_W2, A, 'worker', true], [U.A_OLD, A, 'worker', false], [U.B_ADMIN, B, 'admin', true], [U.B_W, B, 'worker', true], [U.SUP, S, 'admin', true]];
const ACTORS = [...Object.entries(U).map(([k, v]) => ({ k, sub: v, role: 'authenticated' })), { k: 'ANON', sub: null, role: 'anon' }];
const UU = [U.A_ADMIN, U.A_LEAD, U.A_W1, U.A_W2, U.A_OLD, U.B_W];
const CO = [A, B];
const q = (v) => v === null ? 'NULL' : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
// is_my_team_member borne la date à 7 jours : aujourd'hui, J-3 (dans la borne) et J-8 (hors borne)
const today = "((now() AT TIME ZONE 'Europe/Paris')::date)";
const D0 = today, D3 = `(${today} - 3)`, D8 = `(${today} - 8)`;
const MA1 = 'd0000000-0000-0000-0000-000000000001', MA2 = 'd0000000-0000-0000-0000-000000000002', MA3 = 'd0000000-0000-0000-0000-000000000003', MB1 = 'd0000000-0000-0000-0000-000000000004';
const raw = (s) => ({ raw: s });
const lit = (v) => (v && v.raw !== undefined) ? v.raw : q(v);
// table -> { ddl, dom (produit cartésien des colonnes testées), variants (UPDATE qui MODIFIENT des colonnes) }
const T = {
  active_sessions: { ddl: 'company_id uuid, user_id uuid, planning_id uuid', dom: { company_id: CO, user_id: UU } },
  assistant_journal: { ddl: 'company_id uuid, actor_id uuid', dom: { company_id: CO, actor_id: UU } },
  day_tasks: { ddl: 'company_id uuid, user_id uuid, created_by uuid', dom: { company_id: CO, user_id: [...UU, U.A_ADMIN], created_by: [U.A_ADMIN, U.A_W1, U.B_ADMIN] } },
  documents: { ddl: 'company_id uuid, uploaded_by uuid', dom: { company_id: CO, uploaded_by: UU } },
  leave_requests: { ddl: 'company_id uuid, user_id uuid, status text', dom: { company_id: CO, user_id: UU, status: ['pending', 'approved'] } },
  meeting_participants: { ddl: 'company_id uuid, user_id uuid, meeting_id uuid', dom: { company_id: CO, user_id: UU, meeting_id: [MA1, MB1] } },
  meetings: { ddl: 'company_id uuid, all_team boolean', rows: [[MA1, A, false], [MA2, A, true], [MA3, A, false], [MB1, B, false]], cols: ['id', 'company_id', 'all_team'] },
  month_closures: { ddl: 'company_id uuid, month date, closed_by uuid', dom: { company_id: CO, month: [raw("date '2026-01-01'"), raw("date '2026-02-01'")], closed_by: [null, U.A_ADMIN, U.B_ADMIN, U.A_W1] },
    variants: { cb_admin: `closed_by = '${U.A_ADMIN}'`, cb_other: `closed_by = '${U.B_ADMIN}'`, cb_null: 'closed_by = NULL', co_b: `company_id = '${B}'` } },
  planning: { ddl: 'company_id uuid, user_id uuid, work_date date', dom: { company_id: CO, user_id: UU, work_date: [raw(D0), raw(D3), raw(D8)] } },
  push_subscriptions: { ddl: 'user_id uuid', dom: { user_id: UU, n: [1, 2] }, noN: true },
  task_templates: { ddl: 'company_id uuid, created_by uuid', dom: { company_id: CO, created_by: [U.A_ADMIN, U.A_W1, U.B_ADMIN, null] } },
  time_entries: { ddl: 'company_id uuid, user_id uuid, work_date date, status text, locked boolean', dom: { company_id: CO, user_id: UU, work_date: [raw(D0), raw(D3), raw(D8)], status: ['draft', 'submitted', 'cancelled'], locked: [false, true] },
    variants: { st_cancelled: "status = 'cancelled'", st_draft: "status = 'draft'", st_exported: "status = 'exported'", lock: 'locked = true', co_b: `company_id = '${B}'`, uid_other: `user_id = '${U.A_W2}'` } },
  time_entry_corrections: { ddl: 'company_id uuid, worker_id uuid, work_date date, corrected_by uuid, notified_at timestamptz', dom: { company_id: CO, worker_id: [U.A_W1, U.A_W2, U.B_W], corrected_by: [U.A_ADMIN, U.A_LEAD, U.B_ADMIN], work_date: [raw(D0), raw(D8)], notified_at: [null, raw('now()')] },
    variants: { notified: 'notified_at = now()', cb_admin: `corrected_by = '${U.A_ADMIN}'`, cb_b: `corrected_by = '${U.B_ADMIN}'`, co_b: `company_id = '${B}'` } },
  time_entry_edits: { ddl: 'company_id uuid, worker_id uuid', dom: { company_id: CO, worker_id: UU } },
  time_entry_positions: { ddl: 'company_id uuid, user_id uuid', dom: { company_id: CO, user_id: UU } },
  traces: { ddl: 'company_id uuid, object_table text, user_id uuid, before jsonb, after jsonb', dom: { company_id: CO, object_table: ['planning', 'time_entries', 'meetings', 'companies'], user_id: [U.A_W1, U.A_ADMIN, null],
    before: [null, raw(`'{"all_team": true}'::jsonb`), raw(`'{"all_team": false}'::jsonb`)], after: [null, raw(`'{"all_team": true}'::jsonb`), raw(`'{"all_team": false}'::jsonb`)] } },
  training_video_views: { ddl: 'company_id uuid, user_id uuid', dom: { company_id: CO, user_id: UU } },
  training_views: { ddl: 'company_id uuid, user_id uuid', dom: { company_id: CO, user_id: UU } },
  // cb_w1 / cb_admin2 : « closed_by » = un autre membre de la même entreprise => branche EXISTS du WITH CHECK
  user_closures: { ddl: 'company_id uuid, user_id uuid, closed_by uuid', dom: { company_id: CO, user_id: [U.A_W1, U.B_W, U.A_ADMIN], closed_by: [null, U.A_ADMIN, U.B_ADMIN, U.A_W1, U.GHOST] },
    variants: { cb_admin: `closed_by = '${U.A_ADMIN}'`, cb_null: 'closed_by = NULL', cb_b: `closed_by = '${U.B_ADMIN}'`, cb_ghost: `closed_by = '${U.GHOST}'`, uid_b: `user_id = '${U.B_W}'`,
      cb_w1: `closed_by = '${U.A_W1}'`, cb_admin2: `closed_by = '${U.A_ADMIN2}'` } },
};
// support_read existe sur ces tables en production : elle est hors liste et ne doit pas bouger
const SUPPORT_TABLES = ['active_sessions', 'documents', 'leave_requests', 'month_closures', 'planning', 'time_entries', 'time_entry_corrections', 'time_entry_positions', 'users', 'user_closures'];
const cross = (dom) => Object.entries(dom).reduce((acc, [k, vs]) => acc.flatMap((r) => vs.map((v) => ({ ...r, [k]: v }))), [{}]);

console.log('— schéma et jeu fictif');
const db = new PGlite();
await db.exec(`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE TABLE public.companies (id uuid PRIMARY KEY);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid, role varchar(20), is_active boolean DEFAULT true);
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
  AS $$ SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() AND u.is_active IS DISTINCT FROM false LIMIT 1 $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
CREATE FUNCTION public.is_lead() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text = 'lead' AND is_active IS DISTINCT FROM false) $$;
CREATE FUNCTION public.is_my_team_member(p_user uuid, p_date date) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.is_lead() AND p_user IS NOT NULL
     AND p_date BETWEEN (now() AT TIME ZONE 'Europe/Paris')::date - 6 AND (now() AT TIME ZONE 'Europe/Paris')::date
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.company_id = public.get_my_company_id()
          AND u.role::text IN ('worker', 'lead') AND u.is_active IS DISTINCT FROM false);
$function$;
CREATE FUNCTION public.support_company_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT CASE WHEN auth.uid() = '${U.SUP}' THEN ARRAY['${A}']::uuid[] ELSE ARRAY[]::uuid[] END $$;
-- DROITS DE PRODUCTION : ces fonctions ne sont exécutables que par « authenticated » (jamais « anon »).
-- Sur les 4 règles de rôle « public », anon obtient donc « permission denied » (42501), avant comme après.
REVOKE EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin(), public.is_my_team_member(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin(), public.is_my_team_member(uuid, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION auth.uid() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lead(), public.support_company_ids() TO authenticated;
CREATE TABLE public.worksite_expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, worksite_id uuid, spent_on date);
`);
for (const [t, s] of Object.entries(T)) await db.exec(`CREATE TABLE public.${t} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ${s.ddl});`);
await db.exec(`INSERT INTO public.companies VALUES ('${A}'), ('${B}'), ('${S}');`);
for (const [id, co, role, act] of USERS) await db.exec(`INSERT INTO public.users VALUES ('${id}', '${co}', '${role}', ${act});`);
let nrows = 0;
for (const [t, s] of Object.entries(T)) {
  if (s.rows) { for (const r of s.rows) await db.exec(`INSERT INTO public.${t} (${s.cols.join(',')}) VALUES (${r.map(lit).join(',')});`); nrows += s.rows.length; continue; }
  const rows = cross(s.dom);
  const cols = Object.keys(s.dom).filter((c) => !(s.noN && c === 'n'));
  const vals = rows.map((r) => `(${cols.map((c) => lit(r[c])).join(',')})`).join(',');
  await db.exec(`INSERT INTO public.${t} (${cols.join(',')}) VALUES ${vals};`); nrows += rows.length;
}
// RLS + les 33 règles « avant » créées depuis le TEXTE DE L'EXPORT (jamais réécrites à la main)
for (const t of [...Object.keys(T), 'users']) await db.exec(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
for (const p of pols) {
  const to = p.roles === 'public' ? '' : `TO ${p.roles}`;
  await db.exec(`CREATE POLICY ${p.name} ON public.${p.table} AS PERMISSIVE FOR ${p.cmd} ${to} ${p.using ? `USING ${p.using}` : ''} ${p.check ? `WITH CHECK ${p.check}` : ''};`);
}
for (const t of SUPPORT_TABLES) await db.exec(`CREATE POLICY support_read ON public.${t} FOR SELECT TO authenticated USING (company_id = ANY ((SELECT public.support_company_ids())::uuid[]));`);
// règles HORS LISTE (« nues » comme en production) : elles ne doivent pas bouger
await db.exec(`CREATE POLICY time_entries_admin_all_mutations ON public.time_entries FOR ALL TO authenticated USING (company_id = get_my_company_id() AND is_admin()) WITH CHECK (company_id = get_my_company_id() AND is_admin());
CREATE POLICY planning_admin_all ON public.planning FOR ALL TO authenticated USING (company_id = get_my_company_id() AND is_admin());`);

// fidélité du « avant » : le texte relu par la base == l'export (espaces normalisés)
const cur = (await db.query(`SELECT tablename, policyname, cmd, roles::text, permissive, qual, with_check FROM pg_policies WHERE policyname = ANY($1)`, [pols.map((p) => p.name)])).rows;
const fidKo = pols.filter((p) => {
  const c = cur.find((x) => x.policyname === p.name && x.tablename === p.table);
  return !c || c.permissive !== 'PERMISSIVE' || norm(c.qual) !== norm(p.using) || norm(c.with_check) !== norm(p.check);
}).map((p) => p.name);
ok(cur.length === 33 && fidKo.length === 0, '« avant » : les 33 règles relues dans la base sont identiques à l\'export de production', fidKo);
ok(cur.filter((c) => c.roles === '{public}').length === 4, '« avant » : 4 règles de rôle public (comme en production)');
ok(nrows > 500, `jeu fictif : ${nrows} lignes`);

// ───────────────────────────── 4. Sondes ─────────────────────────────
// Chaque instruction est jouée dans un sous-bloc annulé ; le résultat est « rows=N » ou « err=SQLSTATE ».
await db.exec(`
CREATE SCHEMA zz; GRANT USAGE ON SCHEMA zz TO anon, authenticated;
CREATE FUNCTION zz.probe(q text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n bigint; d text;
BEGIN
  BEGIN
    EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'zz' USING ERRCODE = 'ZZ001', DETAIL = n::text;
  EXCEPTION
    WHEN SQLSTATE 'ZZ001' THEN GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL; RETURN 'rows=' || d;
    WHEN OTHERS THEN RETURN 'err=' || SQLSTATE;
  END;
END $f$;
GRANT EXECUTE ON FUNCTION zz.probe(text) TO anon, authenticated;
`);
// instantané des lignes pour fabriquer les INSERT (copies de lignes existantes)
for (const t of Object.keys(T)) await db.exec(`CREATE TABLE zz.s_${t} AS SELECT * FROM public.${t}; GRANT SELECT ON zz.s_${t} TO anon, authenticated;`);
const keyRows = {}; for (const t of Object.keys(T)) keyRows[t] = (await db.query(`SELECT id::text FROM zz.s_${t} ORDER BY id`)).rows.map((r) => r.id);

async function runPhase(tables = Object.keys(T)) {
  const res = new Map();
  for (const a of ACTORS) {
    await db.exec('BEGIN');
    await db.exec(`SET LOCAL ROLE ${a.role}`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [a.sub ?? '']);
    for (const t of tables) {
      const ops = [
        ['sel', (id) => `SELECT 1 FROM public.${t} WHERE id = '${id}'`],
        ['ins', (id) => `INSERT INTO public.${t} SELECT (jsonb_populate_record(NULL::public.${t}, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid()::text))).* FROM zz.s_${t} s WHERE s.id = '${id}'`],
        ['upd_noop', (id) => `UPDATE public.${t} SET id = id WHERE id = '${id}'`],
        ['del', (id) => `DELETE FROM public.${t} WHERE id = '${id}'`],
        ...Object.entries(T[t].variants || {}).map(([n, set]) => [`upd_${n}`, (id) => `UPDATE public.${t} SET ${set} WHERE id = '${id}'`]),
      ];
      for (const [op, f] of ops) {
        const stmts = keyRows[t].map((id) => [id, f(id)]);
        const r = await db.query(`SELECT i, zz.probe(s) AS o FROM unnest($1::text[], $2::text[]) AS x(i, s)`, [stmts.map((x) => x[0]), stmts.map((x) => x[1])]);
        for (const row of r.rows) res.set(`${a.k}|${t}|${op}|${row.i}`, row.o);
      }
    }
    await db.exec('ROLLBACK');
  }
  return res;
}
// liste des utilisateurs visibles par acteur (règle hors liste « users », lue par les règles via EXISTS)
async function usersVisibles() {
  const o = {};
  for (const a of ACTORS) {
    await db.exec('BEGIN'); await db.exec(`SET LOCAL ROLE ${a.role}`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [a.sub ?? '']);
    o[a.k] = (await db.query(`SELECT string_agg(id::text, ',' ORDER BY id) AS s FROM public.users`)).rows[0].s;
    await db.exec('ROLLBACK');
  }
  return o;
}
const empreinteHorsListe = async () => (await db.query(`SELECT policyname, tablename, md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) m FROM pg_policies WHERE NOT (policyname = ANY($1)) ORDER BY 1,2`, [pols.map((p) => p.name)])).rows.map((r) => r.tablename + '.' + r.policyname + ':' + r.m).join(',');
const meta = async () => (await db.query(`SELECT string_agg(tablename || '.' || policyname || ':' || cmd || ':' || permissive || ':' || roles::text, ',' ORDER BY tablename, policyname) s FROM pg_policies`)).rows[0].s;
const compte = async () => (await db.query(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'`)).rows[0].n;
const diffEntre = (a, b, filtre = () => true) => { let n = 0; const ex = []; for (const [k, v] of a) if (filtre(k) && b.get(k) !== v) { n++; if (ex.length < 5) ex.push(`${k}: ${v} -> ${b.get(k)}`); } return { n, ex }; };

console.log('— phase AVANT');
let t0 = Date.now();
const avant = await runPhase();
console.log(`  ${avant.size} sondes en ${Math.round((Date.now() - t0) / 1000)} s`);
const usersAvant = await usersVisibles();
const horsListeAvant = await empreinteHorsListe();
const metaAvant = await meta();
const nbReglesAvant = await compte();
ok(avant.size > 50000, 'plus de 50 000 sondes par phase', avant.size);

// vérification de l'en-tête (extraite du fichier lui-même)
const mv = /VÉRIFICATION APRÈS APPLICATION[^\n]*\n((?:--   [^\n]*\n|--\n)+?)--   Puis/.exec(fichier);
ok(!!mv, 'la requête de vérification est extraite de l\'en-tête');
const verifSql = mv[1].split('\n').map((l) => l.replace(/^--   ?/, '')).join('\n');
const verifAvant = (await db.query(verifSql)).rows[0];
ok(verifAvant.v4_aucun_appel_nu === false && verifAvant.v5_96_appels_entoures === false && verifAvant.v8_4_index === false,
  '« avant » : la vérification est fausse sur v4, v5 et v8 (elle détecte bien l\'état d\'avant)', verifAvant);
ok(verifAvant.v1_33_regles_presentes && verifAvant.v2_toutes_permissives && verifAvant.v3_roles_inchanges && verifAvant.v6_is_my_team_member_nu && verifAvant.v7_texte_identique_a_l_export,
  '« avant » : v1, v2, v3, v6 et v7 déjà vraies (texte identique à l\'export)', verifAvant);

// ───────────────────────────── 5. La migration ─────────────────────────────
console.log('— migration');
const mig = fichier;
try { await db.exec(mig); ok(true, 'la migration s\'applique sans erreur'); } catch (e) { ok(false, 'la migration s\'applique sans erreur', e.message); }
const verifApres = (await db.query(verifSql)).rows[0];
const vals = Object.values(verifApres);
ok(vals.length === 9 && vals.every((v) => v === true), '« après » : la vérification vaut 9 × true', verifApres);
ok((await compte()) === nbReglesAvant, `nombre de règles inchangé (${nbReglesAvant})`);

console.log('— phase APRÈS');
t0 = Date.now();
const apres = await runPhase();
console.log(`  ${apres.size} sondes en ${Math.round((Date.now() - t0) / 1000)} s`);
const d = diffEntre(avant, apres);
// Seule différence admise, et uniquement pour le rôle « anon » : un DELETE / UPDATE qui ne trouvait rien
// (rows=0, la règle par défaut « tout refuser » court-circuitait la règle de lecture) échoue maintenant
// avec « permission denied » (42501), parce que (SELECT get_my_company_id()) est préparé AVANT la lecture
// des lignes. Dans les deux cas anon ne touche à AUCUNE ligne ; il n'y a que ces deux tables à règle « public ».
const estAnonSansAcces = (k, v, w) => k.startsWith('ANON|') && /^ANON\|time_entry_(corrections|positions)\|(del|upd_)/.test(k) && v === 'rows=0' && w === 'err=42501';
const reelles = [], anonSeul = [];
for (const [k, v] of avant) { const w = apres.get(k); if (w === v) continue; (estAnonSansAcces(k, v, w) ? anonSeul : reelles).push(`${k}: ${v} -> ${w}`); }
ok(apres.size === avant.size && reelles.length === 0, `0 différence de droits sur ${avant.size} sondes (lignes visibles / écrivables identiques)`, reelles.slice(0, 5));
ok(!reelles.length && d.n === anonSeul.length, `différences d'ERREUR seulement (anon, rows=0 -> permission denied, aucune ligne touchée) : ${anonSeul.length}`, anonSeul.slice(0, 3));
ok(![...avant].some(([k, v]) => v === 'rows=1' && apres.get(k) !== 'rows=1') && ![...apres].some(([k, v]) => v === 'rows=1' && avant.get(k) !== 'rows=1'),
  'aucune ligne n\'est devenue accessible ou inaccessible pour personne');
const usersApres = await usersVisibles();
ok(JSON.stringify(usersAvant) === JSON.stringify(usersApres), 'liste des utilisateurs visibles identique pour chaque acteur');
ok(horsListeAvant === await empreinteHorsListe(), 'les règles hors liste (support_read, time_entries_admin_all_mutations, planning_admin_all…) n\'ont pas bougé');
ok(metaAvant === await meta(), 'table / règle / commande / rôles / permissive identiques pour toutes les règles');
// anon : « permission denied » identique avant et après sur les règles public
const anonErr = [...avant].filter(([k, v]) => k.startsWith('ANON|time_entry') && v === 'err=42501').length;
ok(anonErr > 0, 'anon obtient « permission denied » (42501) sur les règles public, avant comme après', anonErr);

// couverture : combinaisons table|opération avec des cas autorisés ET refusés
const cover = {};
for (const [k, v] of avant) { const [, t, op] = k.split('|'); const c = (cover[`${t}|${op}`] ??= { ok: 0, no: 0 }); if (v === 'rows=1') c.ok++; else c.no++; }
const faibles = Object.entries(cover).filter(([, c]) => !c.ok || !c.no).map(([k]) => k);
console.log(`  combinaisons table|opération sans cas autorisé ou sans cas refusé (pas de règle de cette commande, en général) : ${faibles.length}`);
console.log('   ', faibles.join(' '));
for (const k of ['time_entries|sel', 'time_entries|upd_noop', 'time_entries|upd_st_exported', 'time_entries|del', 'time_entries|ins', 'planning|sel', 'meetings|sel',
  'traces|sel', 'user_closures|upd_cb_w1', 'user_closures|upd_cb_admin2', 'month_closures|upd_cb_other', 'time_entry_corrections|ins']) {
  ok(cover[k] && cover[k].ok > 0 && cover[k].no > 0, `couverture : ${k} a des cas autorisés ET refusés`, cover[k]);
}

// ───────────────────────────── 6. Le test sait-il voir une différence ? (mutations) ─────────────────────────────
// Appliquées DIRECTEMENT (sans la garde) sur la base migrée, une règle à la fois, puis annulées.
console.log('— mutations (le test doit détecter chacune)');
const parNom = (n) => pols.find((p) => p.name === n);
const mutations = [
  { nom: 'OR devient AND dans active_sessions_select', regle: 'active_sessions_select', table: 'active_sessions', mut: (u, w) => ({ u: u.replace('(SELECT is_admin()) OR', '(SELECT is_admin()) AND'), w }) },
  { nom: 'is_admin() retiré de leave_requests_select', regle: 'leave_requests_select', table: 'leave_requests', mut: (u, w) => ({ u: u.replace('(SELECT is_admin()) OR ', ''), w }) },
  { nom: 'WITH CHECK élargi dans time_entries_worker_update', regle: 'time_entries_worker_update', table: 'time_entries', mut: (u, w) => ({ u, w: w.replace("'cancelled'::text", "'cancelled'::text, 'exported'::text") }) },
];
for (const m of mutations) {
  const p = parNom(m.regle);
  const u0 = p.using ? wrap(p.using) : null, w0 = p.check ? wrap(p.check) : null;
  const { u, w } = m.mut(u0, w0);
  ok(u !== u0 || w !== w0, `mutation « ${m.nom} » : le texte a bien changé`);
  const debut = Date.now();
  await db.exec(alterOf(p, u, w));
  const mutee = await runPhase([m.table]);
  const dm = diffEntre(avant, mutee, (k) => k.split('|')[1] === m.table);
  ok(dm.n >= 1, `mutation « ${m.nom} » détectée (${dm.n} différence(s))`, dm.ex);
  await db.exec(alterOf(p, u0, w0)); // on remet la vraie règle
  const remise = await runPhase([m.table]);
  const dr = diffEntre(avant, remise, (k) => k.split('|')[1] === m.table);
  ok(dr.n === 0, `après remise de la vraie règle ${m.regle} : 0 différence`, dr.ex);
  console.log(`    (${Math.round((Date.now() - debut) / 1000)} s)`);
}

// ───────────────────────────── 7. Rejeu et garde ─────────────────────────────
console.log('— rejeu et garde');
const horsListeAvantRejeu = await empreinteHorsListe();
try { await db.exec(mig); ok(true, '2e passage de la migration : aucune erreur'); } catch (e) { ok(false, '2e passage de la migration : aucune erreur', e.message); }
const dRejeu = diffEntre(avant, await runPhase(['leave_requests', 'user_closures']), (k) => ['leave_requests', 'user_closures'].includes(k.split('|')[1]));
ok(dRejeu.n === 0 && horsListeAvantRejeu === await empreinteHorsListe() && (await compte()) === nbReglesAvant, '2e passage : rien ne change');
ok(Object.values((await db.query(verifSql)).rows[0]).every((v) => v === true), 'après rejeu : 9 × true');
// dérive simulée : une règle de la liste modifiée à la main => la garde refuse, avec son nom
await db.exec(`ALTER POLICY users_select_company ON public.users USING ((company_id = get_my_company_id()) AND false)`);
try { await db.exec(mig); ok(false, 'garde : une règle modifiée à la main fait échouer la migration'); }
catch (e) { ok(/users_select_company/.test(e.message), 'garde : une règle modifiée à la main fait échouer la migration, avec le nom de la règle', e.message); }

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\ntout est vert');
process.exit(fails ? 1 : 0);
